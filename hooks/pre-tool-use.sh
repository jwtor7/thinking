#!/bin/bash
# Wrapper for PreToolUse hook - sets HOOK_TYPE and calls universal handler
HOOK_TYPE=PreToolUse exec "$(dirname "$0")/thinking-monitor-hook.sh"
