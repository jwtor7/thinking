#!/bin/bash
# Wrapper for SubagentStart hook - sets HOOK_TYPE and calls universal handler
HOOK_TYPE=SubagentStart exec "$(dirname "$0")/thinking-monitor-hook.sh"
