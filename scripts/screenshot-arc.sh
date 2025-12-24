#!/bin/bash
# Screenshot the frontmost Arc window
# Usage: pnpm screenshot [name]
# Note: Focus the Thinking Monitor tab in Arc before running

set -e

SCREENSHOT_DIR="/tmp/thinking-monitor-screenshots"
NAME="${1:-screenshot}"
TIMESTAMP=$(date +%H%M%S)
OUTPUT="$SCREENSHOT_DIR/${NAME}-${TIMESTAMP}.png"

mkdir -p "$SCREENSHOT_DIR"

# Get CGWindowID of frontmost Arc window via Swift
WINDOW_ID=$(swift -e '
import Cocoa
let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
if let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
    for window in windowList {
        if let owner = window["kCGWindowOwnerName"] as? String, owner == "Arc",
           let layer = window["kCGWindowLayer"] as? Int, layer == 0,
           let windowID = window["kCGWindowNumber"] as? Int {
            print(windowID)
            break
        }
    }
}
' 2>/dev/null)

if [ -z "$WINDOW_ID" ]; then
    echo "Error: No Arc window found"
    exit 1
fi

screencapture -l "$WINDOW_ID" "$OUTPUT"
echo "$OUTPUT"
