#!/bin/bash
#
# Thinking Monitor Setup Script
#
# This script registers the Thinking Monitor hooks with Claude Code.
# It modifies ~/.claude/settings.json to add hook configurations.
#
# Usage:
#   ./scripts/setup.sh [--install|--uninstall|--status]
#
# Options:
#   --install    Install hooks (default)
#   --uninstall  Remove hooks
#   --status     Check if hooks are installed
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where the hooks are located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$(dirname "$SCRIPT_DIR")/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"

# Print with color
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check dependencies
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed. Install with: brew install jq"
        exit 1
    fi

    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed."
        exit 1
    fi
}

# Verify hook scripts exist
verify_hooks() {
    local hooks=("pre-tool-use.sh" "post-tool-use.sh" "subagent-start.sh" "subagent-stop.sh" "session-start.sh" "session-stop.sh" "thinking-monitor-hook.sh")

    for hook in "${hooks[@]}"; do
        if [ ! -f "$HOOKS_DIR/$hook" ]; then
            print_error "Missing hook script: $HOOKS_DIR/$hook"
            exit 1
        fi
        if [ ! -x "$HOOKS_DIR/$hook" ]; then
            print_warning "Making $hook executable"
            chmod +x "$HOOKS_DIR/$hook"
        fi
    done

    print_success "All hook scripts verified"
}

# Backup settings file
backup_settings() {
    if [ -f "$SETTINGS_FILE" ]; then
        local backup="$SETTINGS_FILE.backup.$(date +%Y%m%d%H%M%S)"
        cp "$SETTINGS_FILE" "$backup"
        print_info "Backed up settings to $backup"
    fi
}

# Check if hooks are already installed
check_installed() {
    if [ ! -f "$SETTINGS_FILE" ]; then
        return 1
    fi

    # Check for any of our hooks (look for our hooks directory path)
    if jq -e --arg dir "$HOOKS_DIR" '.hooks.PreToolUse[]?.hooks[]?.command | select(contains($dir))' "$SETTINGS_FILE" > /dev/null 2>&1; then
        return 0
    fi

    return 1
}

# Install hooks
install_hooks() {
    print_info "Installing Thinking Monitor hooks..."

    check_dependencies
    verify_hooks

    # Ensure settings directory exists
    mkdir -p "$(dirname "$SETTINGS_FILE")"

    # Create settings file if it doesn't exist
    if [ ! -f "$SETTINGS_FILE" ]; then
        echo '{}' > "$SETTINGS_FILE"
        print_info "Created new settings file"
    fi

    backup_settings

    # Check if already installed
    if check_installed; then
        print_warning "Hooks appear to already be installed"
        print_info "Use --uninstall first if you want to reinstall"
        return 0
    fi

    # Create the hooks configuration
    local hook_config
    hook_config=$(cat <<EOF
{
    "PreToolUse": [
        {
            "hooks": [
                {
                    "type": "command",
                    "command": "$HOOKS_DIR/pre-tool-use.sh"
                }
            ]
        }
    ],
    "PostToolUse": [
        {
            "hooks": [
                {
                    "type": "command",
                    "command": "$HOOKS_DIR/post-tool-use.sh"
                }
            ]
        }
    ],
    "SubagentStart": [
        {
            "hooks": [
                {
                    "type": "command",
                    "command": "$HOOKS_DIR/subagent-start.sh"
                }
            ]
        }
    ],
    "SubagentStop": [
        {
            "hooks": [
                {
                    "type": "command",
                    "command": "$HOOKS_DIR/subagent-stop.sh"
                }
            ]
        }
    ],
    "SessionStart": [
        {
            "hooks": [
                {
                    "type": "command",
                    "command": "$HOOKS_DIR/session-start.sh"
                }
            ]
        }
    ],
    "SessionEnd": [
        {
            "hooks": [
                {
                    "type": "command",
                    "command": "$HOOKS_DIR/session-stop.sh"
                }
            ]
        }
    ]
}
EOF
)

    # Merge with existing settings
    # This preserves existing hooks while adding ours
    local current_hooks
    current_hooks=$(jq '.hooks // {}' "$SETTINGS_FILE")

    # For each hook type, append our hook to any existing hooks
    local merged_hooks
    merged_hooks=$(echo "$hook_config" | jq --argjson current "$current_hooks" '
        . as $new |
        $current |
        # For each key in new config, append to existing array or use new array
        . + ($new | to_entries | map({
            key: .key,
            value: (
                if $current[.key] then
                    $current[.key] + .value
                else
                    .value
                end
            )
        }) | from_entries)
    ')

    # Update settings file
    jq --argjson hooks "$merged_hooks" '.hooks = $hooks' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"
    mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

    print_success "Hooks installed successfully!"
    print_info "Hooks are now active for new Claude Code sessions"
    print_info ""
    print_info "To start the monitor server:"
    print_info "  cd $(dirname "$SCRIPT_DIR") && pnpm dev"
    print_info ""
    print_info "Then open http://localhost:3356 in your browser"
}

# Uninstall hooks
uninstall_hooks() {
    print_info "Uninstalling Thinking Monitor hooks..."

    if [ ! -f "$SETTINGS_FILE" ]; then
        print_warning "Settings file not found, nothing to uninstall"
        return 0
    fi

    backup_settings

    # Remove hooks that contain our path
    local hooks_dir_escaped
    hooks_dir_escaped=$(echo "$HOOKS_DIR" | sed 's/[\/&]/\\&/g')

    # Filter out our hooks from each hook type
    jq --arg dir "$HOOKS_DIR" '
        .hooks |= (
            . // {} |
            with_entries(
                .value |= map(
                    .hooks |= map(
                        select(.command | contains($dir) | not)
                    ) |
                    select(.hooks | length > 0)
                ) |
                select(length > 0)
            )
        )
    ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"

    mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

    print_success "Hooks uninstalled successfully!"
    print_info "Changes take effect in new Claude Code sessions"
}

# Show status
show_status() {
    print_info "Checking Thinking Monitor hook status..."

    if [ ! -f "$SETTINGS_FILE" ]; then
        print_warning "Settings file not found at $SETTINGS_FILE"
        return 1
    fi

    if check_installed; then
        print_success "Hooks are installed"

        # Show which hooks are registered
        print_info "Registered hooks:"
        for hook_type in PreToolUse PostToolUse SubagentStart SubagentStop SessionStart SessionEnd; do
            local count
            count=$(jq -r --arg type "$hook_type" --arg dir "$HOOKS_DIR" '
                .hooks[$type] // [] |
                map(.hooks // []) |
                flatten |
                map(select(.command | contains($dir))) |
                length
            ' "$SETTINGS_FILE")

            if [ "$count" -gt 0 ]; then
                echo "  - $hook_type: $count hook(s)"
            fi
        done

        # Check if monitor server is running
        if curl -s --max-time 1 "http://127.0.0.1:3355/health" > /dev/null 2>&1; then
            print_success "Monitor server is running"
        else
            print_warning "Monitor server is not running"
            print_info "Start with: cd $(dirname "$SCRIPT_DIR") && pnpm dev"
        fi
    else
        print_warning "Hooks are not installed"
        print_info "Install with: $0 --install"
    fi
}

# Main entry point
main() {
    local command="${1:---install}"

    case "$command" in
        --install|-i)
            install_hooks
            ;;
        --uninstall|-u)
            uninstall_hooks
            ;;
        --status|-s)
            show_status
            ;;
        --help|-h)
            echo "Thinking Monitor Setup Script"
            echo ""
            echo "Usage: $0 [option]"
            echo ""
            echo "Options:"
            echo "  --install, -i    Install hooks (default)"
            echo "  --uninstall, -u  Remove hooks"
            echo "  --status, -s     Check installation status"
            echo "  --help, -h       Show this help"
            ;;
        *)
            print_error "Unknown option: $command"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
}

main "$@"
