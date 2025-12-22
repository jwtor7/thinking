#!/bin/bash
# Wrapper for PostToolUse hook - sets HOOK_TYPE and calls universal handler
HOOK_TYPE=PostToolUse exec "$(dirname "$0")/thinking-monitor-hook.sh"
