#!/bin/bash
#
# Thinking Monitor Universal Hook Script
#
# This script handles all Claude Code hook events and forwards them to the
# Thinking Monitor server. It's designed to be fire-and-forget: it sends
# events in the background and always exits 0 to avoid blocking Claude Code.
#
# Hook Types Supported:
# - PreToolUse: Fires before tool execution
# - PostToolUse: Fires after tool execution
# - SubagentStart: Fires when a subagent spawns
# - SubagentStop: Fires when a subagent completes
# - SessionStart: Fires when a Claude Code session starts
# - SessionStop: Fires when a Claude Code session ends
#
# Usage:
# This script expects:
# - $HOOK_TYPE environment variable (set by Claude Code or by wrapper)
# - JSON input on stdin with hook payload
#
# Security:
# - Sends to localhost only (127.0.0.1:3355)
# - Uses 1-second timeout to prevent hanging
# - Never blocks Claude Code operations (exit 0 always)
# - Secret redaction happens server-side
#

set -e

# Monitor server endpoint
MONITOR_URL="http://127.0.0.1:3355/event"

# Timeout for curl requests (seconds)
CURL_TIMEOUT=1

# Read JSON input from stdin
INPUT=$(cat)

# Determine hook type from environment or exit if not set
# Claude Code sets this based on which hook is configured
HOOK_TYPE="${HOOK_TYPE:-}"

if [ -z "$HOOK_TYPE" ]; then
    # Try to detect hook type from the calling context
    # This can happen if the script is called directly
    exit 0
fi

# Helper function to send event to monitor server
send_event() {
    local event_json="$1"

    # Send in background with timeout
    # Capture to /dev/null to prevent any output that might confuse Claude Code
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$event_json" \
        --max-time "$CURL_TIMEOUT" \
        --connect-timeout "$CURL_TIMEOUT" \
        "$MONITOR_URL" \
        >/dev/null 2>&1 &

    # Don't wait for curl to complete
    disown 2>/dev/null || true
}

# Generate ISO 8601 timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Extract common fields from input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty' 2>/dev/null || echo "")

# Build event JSON based on hook type
case "$HOOK_TYPE" in
    "PreToolUse")
        TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
        TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null || echo "{}")
        TOOL_CALL_ID=$(echo "$INPUT" | jq -r '.tool_call_id // empty' 2>/dev/null || echo "")

        # Truncate tool input to prevent large payloads
        TOOL_INPUT_TRUNCATED=$(echo "$TOOL_INPUT" | head -c 10000)

        EVENT_JSON=$(jq -n \
            --arg type "tool_start" \
            --arg timestamp "$TIMESTAMP" \
            --arg sessionId "$SESSION_ID" \
            --arg agentId "$AGENT_ID" \
            --arg toolName "$TOOL_NAME" \
            --arg input "$TOOL_INPUT_TRUNCATED" \
            --arg toolCallId "$TOOL_CALL_ID" \
            '{
                type: $type,
                timestamp: $timestamp,
                sessionId: (if $sessionId == "" then null else $sessionId end),
                agentId: (if $agentId == "" then null else $agentId end),
                toolName: $toolName,
                input: $input,
                toolCallId: (if $toolCallId == "" then null else $toolCallId end)
            }')
        ;;

    "PostToolUse")
        TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
        TOOL_OUTPUT=$(echo "$INPUT" | jq -c '.tool_output // .result // {}' 2>/dev/null || echo "{}")
        TOOL_CALL_ID=$(echo "$INPUT" | jq -r '.tool_call_id // empty' 2>/dev/null || echo "")

        # Truncate tool output to prevent large payloads
        TOOL_OUTPUT_TRUNCATED=$(echo "$TOOL_OUTPUT" | head -c 10000)

        EVENT_JSON=$(jq -n \
            --arg type "tool_end" \
            --arg timestamp "$TIMESTAMP" \
            --arg sessionId "$SESSION_ID" \
            --arg agentId "$AGENT_ID" \
            --arg toolName "$TOOL_NAME" \
            --arg output "$TOOL_OUTPUT_TRUNCATED" \
            --arg toolCallId "$TOOL_CALL_ID" \
            '{
                type: $type,
                timestamp: $timestamp,
                sessionId: (if $sessionId == "" then null else $sessionId end),
                agentId: (if $agentId == "" then null else $agentId end),
                toolName: $toolName,
                output: $output,
                toolCallId: (if $toolCallId == "" then null else $toolCallId end)
            }')
        ;;

    "SubagentStart")
        SUBAGENT_ID=$(echo "$INPUT" | jq -r '.subagent_id // .agent_id // empty' 2>/dev/null || echo "")
        SUBAGENT_NAME=$(echo "$INPUT" | jq -r '.agent_name // .name // empty' 2>/dev/null || echo "")
        PARENT_ID=$(echo "$INPUT" | jq -r '.parent_agent_id // empty' 2>/dev/null || echo "")

        EVENT_JSON=$(jq -n \
            --arg type "agent_start" \
            --arg timestamp "$TIMESTAMP" \
            --arg sessionId "$SESSION_ID" \
            --arg agentId "$SUBAGENT_ID" \
            --arg agentName "$SUBAGENT_NAME" \
            --arg parentAgentId "$PARENT_ID" \
            '{
                type: $type,
                timestamp: $timestamp,
                sessionId: (if $sessionId == "" then null else $sessionId end),
                agentId: $agentId,
                agentName: (if $agentName == "" then null else $agentName end),
                parentAgentId: (if $parentAgentId == "" then null else $parentAgentId end)
            }')
        ;;

    "SubagentStop")
        SUBAGENT_ID=$(echo "$INPUT" | jq -r '.subagent_id // .agent_id // empty' 2>/dev/null || echo "")
        STATUS=$(echo "$INPUT" | jq -r '.status // "success"' 2>/dev/null || echo "success")

        EVENT_JSON=$(jq -n \
            --arg type "agent_stop" \
            --arg timestamp "$TIMESTAMP" \
            --arg sessionId "$SESSION_ID" \
            --arg agentId "$SUBAGENT_ID" \
            --arg status "$STATUS" \
            '{
                type: $type,
                timestamp: $timestamp,
                sessionId: (if $sessionId == "" then null else $sessionId end),
                agentId: $agentId,
                status: $status
            }')
        ;;

    "SessionStart")
        CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")

        EVENT_JSON=$(jq -n \
            --arg type "session_start" \
            --arg timestamp "$TIMESTAMP" \
            --arg sessionId "$SESSION_ID" \
            --arg workingDirectory "$CWD" \
            '{
                type: $type,
                timestamp: $timestamp,
                sessionId: $sessionId,
                workingDirectory: (if $workingDirectory == "" then null else $workingDirectory end)
            }')
        ;;

    "SessionStop")
        EVENT_JSON=$(jq -n \
            --arg type "session_stop" \
            --arg timestamp "$TIMESTAMP" \
            --arg sessionId "$SESSION_ID" \
            '{
                type: $type,
                timestamp: $timestamp,
                sessionId: $sessionId
            }')
        ;;

    *)
        # Unknown hook type, silently exit
        exit 0
        ;;
esac

# Send the event to the monitor server
send_event "$EVENT_JSON"

# Always exit 0 to never block Claude Code operations
exit 0
