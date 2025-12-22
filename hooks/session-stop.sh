#!/bin/bash
# Wrapper for SessionStop hook - sets HOOK_TYPE and calls universal handler
HOOK_TYPE=SessionStop exec "$(dirname "$0")/thinking-monitor-hook.sh"
