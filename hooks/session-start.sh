#!/bin/bash
# Wrapper for SessionStart hook - sets HOOK_TYPE and calls universal handler
HOOK_TYPE=SessionStart exec "$(dirname "$0")/thinking-monitor-hook.sh"
