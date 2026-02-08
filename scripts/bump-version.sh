#!/bin/bash
# Wrapper for the portable Node.js version bump script.
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/bump-version.js" "$@"
