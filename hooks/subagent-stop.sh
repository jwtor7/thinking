#!/bin/bash
# Wrapper for SubagentStop hook - sets HOOK_TYPE and calls universal handler
HOOK_TYPE=SubagentStop exec "$(dirname "$0")/thinking-monitor-hook.sh"
