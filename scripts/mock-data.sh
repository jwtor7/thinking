#!/usr/bin/env bash
#
# mock-data.sh — Send realistic sample events to populate all dashboard panels.
# Usage: ./scripts/mock-data.sh
#
# Requires the thinking-monitor server running on localhost:3355.

set -euo pipefail

URL="http://127.0.0.1:3355/event"
BASE_TS=$(date -u +%s)

# ============================================================================
# Helpers
# ============================================================================

# post sends a JSON event to the server.
# Usage: post '{"type":"...","timestamp":"..."}'
post() {
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Origin: http://127.0.0.1:3355" \
    -d "$1")
  if [ "$response" -ne 200 ] && [ "$response" -ne 204 ]; then
    echo "  WARNING: Got HTTP $response"
  fi
}

# ts returns an ISO 8601 UTC timestamp offset by N seconds from base.
ts() {
  local offset="${1:-0}"
  date -u -r $((BASE_TS + offset)) +"%Y-%m-%dT%H:%M:%SZ"
}

# ============================================================================
# Session IDs and constants
# ============================================================================

SESSION_A="mock-sess-a1b2c3d4-e5f6-7890-abcd-ef0123456789"
SESSION_B="mock-sess-f9e8d7c6-b5a4-3210-fedc-ba9876543210"

AGENT_EXPLORE="mock-agent-explore-001"
AGENT_REVIEW="mock-agent-review-002"
AGENT_DOCS="mock-agent-docs-003"

# ============================================================================
# Session start events
# ============================================================================

echo "==> Sending session_start events..."

post "$(cat <<JSON
{
  "type": "session_start",
  "timestamp": "$(ts 0)",
  "sessionId": "$SESSION_A",
  "workingDirectory": "/Users/demo/projects/web-app"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "session_start",
  "timestamp": "$(ts 1)",
  "sessionId": "$SESSION_B",
  "workingDirectory": "/Users/demo/projects/api-server"
}
JSON
)"

echo "    2 sessions started"

# ============================================================================
# Thinking events
# ============================================================================

echo "==> Sending thinking events..."

post "$(cat <<JSON
{
  "type": "thinking",
  "timestamp": "$(ts 2)",
  "sessionId": "$SESSION_A",
  "content": "The user wants to refactor the authentication middleware. I should first read the existing auth.ts file to understand the current token validation logic. The JWT verification is likely in a middleware function that checks the Authorization header. I need to look for expired token handling and refresh token flow."
}
JSON
)"

post "$(cat <<JSON
{
  "type": "thinking",
  "timestamp": "$(ts 5)",
  "sessionId": "$SESSION_A",
  "content": "Looking at the error stack trace, the issue is in the database connection pool. The pool is exhausted because queries are not being released back. The fix should add proper try/finally blocks around each query to ensure connections are always returned to the pool, even when errors occur."
}
JSON
)"

post "$(cat <<JSON
{
  "type": "thinking",
  "timestamp": "$(ts 8)",
  "sessionId": "$SESSION_B",
  "content": "I need to implement rate limiting for the /api/v2/search endpoint. The requirements say 100 requests per minute per API key. I will use a sliding window counter stored in Redis. Let me check if there is an existing rate limiter middleware I can extend."
}
JSON
)"

post "$(cat <<JSON
{
  "type": "thinking",
  "timestamp": "$(ts 40)",
  "sessionId": "$SESSION_B",
  "content": "The test failures are caused by a race condition in the event emitter. When two WebSocket messages arrive within the same microtask, the handler processes them out of order. I should use a queue with sequential processing to guarantee ordering."
}
JSON
)"

echo "    4 thinking events sent"

# ============================================================================
# Tool events (start + end pairs)
# ============================================================================

echo "==> Sending tool events..."

# Tool 1: Read — reading auth middleware
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 10)",
  "sessionId": "$SESSION_A",
  "toolName": "Read",
  "toolCallId": "tool-read-001",
  "input": "{\"file_path\": \"/Users/demo/projects/web-app/src/middleware/auth.ts\"}"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 11)",
  "sessionId": "$SESSION_A",
  "toolName": "Read",
  "toolCallId": "tool-read-001",
  "output": "export function authMiddleware(req, res, next) {\n  const token = req.headers.authorization?.split(' ')[1];\n  if (!token) return res.status(401).json({ error: 'No token provided' });\n  // ... 84 lines",
  "durationMs": 45
}
JSON
)"

# Tool 2: Grep — searching for connection pool usage
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 13)",
  "sessionId": "$SESSION_A",
  "toolName": "Grep",
  "toolCallId": "tool-grep-001",
  "input": "{\"pattern\": \"pool\\\\.query\", \"path\": \"/Users/demo/projects/web-app/src\", \"type\": \"ts\"}"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 14)",
  "sessionId": "$SESSION_A",
  "toolName": "Grep",
  "toolCallId": "tool-grep-001",
  "output": "Found 12 files\nsrc/db/users.ts\nsrc/db/sessions.ts\nsrc/db/products.ts\nsrc/api/handlers/search.ts\n...",
  "durationMs": 320
}
JSON
)"

# Tool 3: Write — fixing the auth middleware
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 16)",
  "sessionId": "$SESSION_A",
  "toolName": "Write",
  "toolCallId": "tool-write-001",
  "input": "{\"file_path\": \"/Users/demo/projects/web-app/src/middleware/auth.ts\", \"content\": \"import { verifyToken } from '../utils/jwt';\\n\\nexport async function authMiddleware(req, res, next) {\\n  try {\\n    const token = req.headers.authorization?.split(' ')[1];\\n    ...\\n  } catch (err) {\\n    return res.status(401).json({ error: 'Invalid token' });\\n  }\\n}\"}"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 17)",
  "sessionId": "$SESSION_A",
  "toolName": "Write",
  "toolCallId": "tool-write-001",
  "output": "File written successfully (24 lines)",
  "durationMs": 28
}
JSON
)"

# Tool 4: Bash — running tests
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 19)",
  "sessionId": "$SESSION_A",
  "toolName": "Bash",
  "toolCallId": "tool-bash-001",
  "input": "npx vitest run src/middleware/auth.test.ts"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 23)",
  "sessionId": "$SESSION_A",
  "toolName": "Bash",
  "toolCallId": "tool-bash-001",
  "output": "stdout:  RUN  v2.1.8 /Users/demo/projects/web-app\n\n ✓ src/middleware/auth.test.ts (8 tests) 142ms\n   ✓ authMiddleware > rejects missing token\n   ✓ authMiddleware > rejects expired token\n   ✓ authMiddleware > accepts valid token\n   ...\n\n Test Files  1 passed (1)\n      Tests  8 passed (8)\n   Duration  0.98s",
  "durationMs": 4120
}
JSON
)"

# Tool 5: Glob — finding rate limiter files
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 25)",
  "sessionId": "$SESSION_B",
  "toolName": "Glob",
  "toolCallId": "tool-glob-001",
  "input": "{\"pattern\": \"**/rate-limit*.ts\", \"path\": \"/Users/demo/projects/api-server/src\"}"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 25)",
  "sessionId": "$SESSION_B",
  "toolName": "Glob",
  "toolCallId": "tool-glob-001",
  "output": "src/middleware/rate-limiter.ts\nsrc/middleware/rate-limiter.test.ts\nsrc/config/rate-limits.ts",
  "durationMs": 18
}
JSON
)"

# Tool 6: Read — reading existing rate limiter
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 27)",
  "sessionId": "$SESSION_B",
  "toolName": "Read",
  "toolCallId": "tool-read-002",
  "input": "{\"file_path\": \"/Users/demo/projects/api-server/src/middleware/rate-limiter.ts\"}"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 28)",
  "sessionId": "$SESSION_B",
  "toolName": "Read",
  "toolCallId": "tool-read-002",
  "output": "import { Redis } from 'ioredis';\nimport { RateLimitConfig } from '../config/rate-limits';\n\nexport class SlidingWindowRateLimiter {\n  constructor(private redis: Redis, private config: RateLimitConfig) {}\n  // ... 62 lines",
  "durationMs": 38
}
JSON
)"

# Tool 7: Bash — running API server tests
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 42)",
  "sessionId": "$SESSION_B",
  "toolName": "Bash",
  "toolCallId": "tool-bash-002",
  "input": "npx vitest run src/middleware/rate-limiter.test.ts"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 47)",
  "sessionId": "$SESSION_B",
  "toolName": "Bash",
  "toolCallId": "tool-bash-002",
  "output": "stdout:  RUN  v2.1.8 /Users/demo/projects/api-server\n\n ✓ src/middleware/rate-limiter.test.ts (12 tests) 890ms\n   ✓ SlidingWindowRateLimiter > allows requests under limit\n   ✓ SlidingWindowRateLimiter > blocks requests over limit\n   ✓ SlidingWindowRateLimiter > resets window after expiry\n   ...\n\n Test Files  1 passed (1)\n      Tests  12 passed (12)\n   Duration  1.42s",
  "durationMs": 5230
}
JSON
)"

# Tool 8: Edit — fixing the connection pool
post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 30)",
  "sessionId": "$SESSION_A",
  "toolName": "Edit",
  "toolCallId": "tool-edit-001",
  "input": "{\"file_path\": \"/Users/demo/projects/web-app/src/db/users.ts\", \"old_string\": \"const result = await pool.query(sql)\", \"new_string\": \"let result;\\ntry {\\n  result = await pool.query(sql);\\n} finally {\\n  client.release();\\n}\"}"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 31)",
  "sessionId": "$SESSION_A",
  "toolName": "Edit",
  "toolCallId": "tool-edit-001",
  "output": "File edited successfully",
  "durationMs": 15
}
JSON
)"

echo "    8 tool pairs sent (Read, Grep, Write, Bash, Glob, Read, Bash, Edit)"

# ============================================================================
# TodoWrite tool events (populates the todo panel)
# ============================================================================

echo "==> Sending TodoWrite tool events..."

post "$(cat <<JSON
{
  "type": "tool_start",
  "timestamp": "$(ts 33)",
  "sessionId": "$SESSION_A",
  "toolName": "TodoWrite",
  "toolCallId": "tool-todo-001",
  "input": "{\"todos\": [{\"content\": \"Refactor auth middleware to async/await\", \"status\": \"completed\", \"activeForm\": \"Refactoring auth middleware\"}, {\"content\": \"Fix database connection pool leak\", \"status\": \"completed\", \"activeForm\": \"Fixing connection pool leak\"}, {\"content\": \"Add refresh token rotation\", \"status\": \"in_progress\", \"activeForm\": \"Adding refresh token rotation\"}, {\"content\": \"Write integration tests for auth flow\", \"status\": \"pending\", \"activeForm\": \"Writing integration tests\"}, {\"content\": \"Update API documentation\", \"status\": \"pending\", \"activeForm\": \"Updating API docs\"}]}"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "tool_end",
  "timestamp": "$(ts 33)",
  "sessionId": "$SESSION_A",
  "toolName": "TodoWrite",
  "toolCallId": "tool-todo-001",
  "output": "Todos updated (5 items)",
  "durationMs": 5
}
JSON
)"

echo "    5 todo items sent (2 completed, 1 in_progress, 2 pending)"

# ============================================================================
# Hook execution events
# ============================================================================

echo "==> Sending hook execution events..."

# Hook 1: PreToolUse allow for Read
post "$(cat <<JSON
{
  "type": "hook_execution",
  "timestamp": "$(ts 9)",
  "sessionId": "$SESSION_A",
  "hookType": "PreToolUse",
  "toolName": "Read",
  "toolCallId": "tool-read-001",
  "decision": "allow",
  "hookName": "file-access-validator",
  "output": "Path /Users/demo/projects/web-app/src/middleware/auth.ts is within allowed directory"
}
JSON
)"

# Hook 2: PreToolUse allow for Write
post "$(cat <<JSON
{
  "type": "hook_execution",
  "timestamp": "$(ts 15)",
  "sessionId": "$SESSION_A",
  "hookType": "PreToolUse",
  "toolName": "Write",
  "toolCallId": "tool-write-001",
  "decision": "allow",
  "hookName": "file-access-validator",
  "output": "Path /Users/demo/projects/web-app/src/middleware/auth.ts is within allowed directory"
}
JSON
)"

# Hook 3: PreToolUse allow for Bash
post "$(cat <<JSON
{
  "type": "hook_execution",
  "timestamp": "$(ts 18)",
  "sessionId": "$SESSION_A",
  "hookType": "PreToolUse",
  "toolName": "Bash",
  "toolCallId": "tool-bash-001",
  "decision": "allow",
  "hookName": "command-allowlist",
  "output": "Command 'npx vitest run' matches allowlist pattern"
}
JSON
)"

# Hook 4: PreToolUse deny for dangerous command
post "$(cat <<JSON
{
  "type": "hook_execution",
  "timestamp": "$(ts 35)",
  "sessionId": "$SESSION_B",
  "hookType": "PreToolUse",
  "toolName": "Bash",
  "toolCallId": "tool-bash-blocked",
  "decision": "deny",
  "hookName": "command-allowlist",
  "output": "BLOCKED: Command 'rm -rf /tmp/cache' matches deny pattern for recursive delete"
}
JSON
)"

echo "    4 hook events sent (3 allow, 1 deny)"

# ============================================================================
# Agent events
# ============================================================================

echo "==> Sending agent events..."

post "$(cat <<JSON
{
  "type": "agent_start",
  "timestamp": "$(ts 36)",
  "sessionId": "$SESSION_A",
  "agentId": "$AGENT_EXPLORE",
  "agentName": "code-explorer"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "agent_start",
  "timestamp": "$(ts 38)",
  "sessionId": "$SESSION_B",
  "agentId": "$AGENT_REVIEW",
  "agentName": "security-reviewer"
}
JSON
)"

post "$(cat <<JSON
{
  "type": "agent_start",
  "timestamp": "$(ts 39)",
  "sessionId": "$SESSION_A",
  "agentId": "$AGENT_DOCS",
  "agentName": "docs-writer"
}
JSON
)"

echo "    3 agent_start events sent"

# ============================================================================
# Plan update events
# ============================================================================

echo "==> Sending plan update events..."

post "$(cat <<JSON
{
  "type": "plan_update",
  "timestamp": "$(ts 3)",
  "path": "/Users/demo/.claude/plans/auth-refactor.md",
  "filename": "auth-refactor.md",
  "content": "# Auth Middleware Refactor\n\n## Goals\n- Migrate to async/await pattern\n- Fix connection pool exhaustion\n- Add refresh token rotation\n\n## Status\n- [x] Read existing middleware\n- [x] Identify pool leak locations\n- [ ] Implement fix\n- [ ] Add tests",
  "lastModified": $((BASE_TS * 1000 + 3000))
}
JSON
)"

post "$(cat <<JSON
{
  "type": "plan_update",
  "timestamp": "$(ts 26)",
  "path": "/Users/demo/.claude/plans/rate-limiting.md",
  "filename": "rate-limiting.md",
  "content": "# API Rate Limiting Implementation\n\n## Requirements\n- 100 req/min per API key on /api/v2/search\n- Sliding window counter in Redis\n- Return 429 with Retry-After header\n\n## Approach\n1. Extend existing SlidingWindowRateLimiter\n2. Add per-endpoint configuration\n3. Add monitoring metrics",
  "lastModified": $((BASE_TS * 1000 + 26000))
}
JSON
)"

echo "    2 plan_update events sent"

# ============================================================================
# Team and task events
# ============================================================================

echo "==> Sending team/task events..."

post "$(cat <<JSON
{
  "type": "team_update",
  "timestamp": "$(ts 37)",
  "teamName": "demo-project",
  "members": [
    {"name": "team-lead", "agentId": "lead-001", "agentType": "leader", "status": "active"},
    {"name": "code-explorer", "agentId": "$AGENT_EXPLORE", "agentType": "worker", "status": "active"},
    {"name": "security-reviewer", "agentId": "$AGENT_REVIEW", "agentType": "worker", "status": "active"},
    {"name": "docs-writer", "agentId": "$AGENT_DOCS", "agentType": "worker", "status": "active"}
  ]
}
JSON
)"

post "$(cat <<JSON
{
  "type": "task_update",
  "timestamp": "$(ts 38)",
  "teamId": "demo-project",
  "tasks": [
    {"id": "1", "subject": "Refactor auth middleware", "status": "completed", "owner": "team-lead", "activeForm": "Refactoring auth", "blocks": [], "blockedBy": []},
    {"id": "2", "subject": "Fix connection pool leak", "status": "completed", "owner": "team-lead", "activeForm": "Fixing pool leak", "blocks": ["4"], "blockedBy": []},
    {"id": "3", "subject": "Implement rate limiting", "status": "in_progress", "owner": "code-explorer", "activeForm": "Implementing rate limiter", "blocks": [], "blockedBy": []},
    {"id": "4", "subject": "Write integration tests", "status": "pending", "owner": "", "activeForm": "Writing integration tests", "blocks": [], "blockedBy": ["2"]},
    {"id": "5", "subject": "Update API documentation for rate limits", "status": "in_progress", "owner": "docs-writer", "activeForm": "Updating API docs", "blocks": [], "blockedBy": ["3"]}
  ]
}
JSON
)"

post "$(cat <<JSON
{
  "type": "message_sent",
  "timestamp": "$(ts 39)",
  "sender": "team-lead",
  "recipient": "code-explorer",
  "messageType": "message",
  "summary": "Rate limiter implementation guidance",
  "content": "Extend the existing SlidingWindowRateLimiter class with per-endpoint config. Check src/config/rate-limits.ts for the config structure."
}
JSON
)"

post "$(cat <<JSON
{
  "type": "message_sent",
  "timestamp": "$(ts 43)",
  "sender": "code-explorer",
  "recipient": "team-lead",
  "messageType": "message",
  "summary": "Rate limiter done, needs review",
  "content": "Finished the sliding window rate limiter with per-endpoint config. Added 12 tests covering limit enforcement, window expiry, and Redis failures. Ready for security review."
}
JSON
)"

post "$(cat <<JSON
{
  "type": "message_sent",
  "timestamp": "$(ts 44)",
  "sender": "team-lead",
  "recipient": "security-reviewer",
  "messageType": "message",
  "summary": "Review rate limiter for bypass risks",
  "content": "Please review the rate limiter implementation for potential bypass vectors. Check header spoofing, key extraction, and Redis race conditions."
}
JSON
)"

post "$(cat <<JSON
{
  "type": "message_sent",
  "timestamp": "$(ts 48)",
  "sender": "security-reviewer",
  "recipient": "team-lead",
  "messageType": "message",
  "summary": "Rate limiter review complete, one issue",
  "content": "Review complete. Found one issue: the API key extraction trusts X-Forwarded-For without validation. An attacker could rotate IPs to bypass per-key limits. Recommend adding a trusted proxy allowlist."
}
JSON
)"

post "$(cat <<JSON
{
  "type": "task_completed",
  "timestamp": "$(ts 50)",
  "taskId": "3",
  "taskSubject": "Implement rate limiting",
  "teamId": "demo-project"
}
JSON
)"

echo "    7 team/task events sent (team_update, task_update, 4 messages, task_completed)"

# ============================================================================
# Subagent mapping event
# ============================================================================

echo "==> Sending subagent mapping..."

post "$(cat <<JSON
{
  "type": "subagent_mapping",
  "timestamp": "$(ts 37)",
  "mappings": [
    {
      "agentId": "$AGENT_EXPLORE",
      "parentSessionId": "$SESSION_A",
      "agentName": "code-explorer",
      "startTime": "$(ts 36)",
      "status": "running"
    },
    {
      "agentId": "$AGENT_REVIEW",
      "parentSessionId": "$SESSION_B",
      "agentName": "security-reviewer",
      "startTime": "$(ts 38)",
      "status": "running"
    },
    {
      "agentId": "$AGENT_DOCS",
      "parentSessionId": "$SESSION_A",
      "agentName": "docs-writer",
      "startTime": "$(ts 39)",
      "status": "running"
    }
  ]
}
JSON
)"

echo "    1 subagent_mapping event sent (3 agents)"

# ============================================================================
# Done
# ============================================================================

echo ""
echo "==> Mock data complete!"
echo "    Sessions:  2"
echo "    Thinking:  4"
echo "    Tools:     8 pairs (16 events)"
echo "    Todos:     5 items"
echo "    Hooks:     4 (3 allow, 1 deny)"
echo "    Agents:    3"
echo "    Plans:     2"
echo "    Team:      1 team, 5 tasks, 4 messages"
echo ""
echo "    Open http://127.0.0.1:3356 to view the dashboard."
