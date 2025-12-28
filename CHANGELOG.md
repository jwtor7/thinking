# Changelog

## [0.4.6] - 2025-12-28

### Fixed
- Session-plan associations now work reliably via Write/Edit tool events only
- Removed flaky plan_update fallback that caused incorrect associations on page load

---

## [0.4.5] - 2025-12-28

### Fixed
- Plan association now works via `plan_update` events, not just Write/Edit tool events
- Plans are now correctly associated with the active session when the plan file is modified

---

## [0.4.4] - 2025-12-28

### Added
- Session-plan associations: when a session writes to a plan file, that plan is automatically associated with the session
- When filtering by session, the Plan panel shows that session's associated plan instead of the most recent plan
- New "No plan for session" message with hint to browse all plans via dropdown

### Changed
- Plan panel now tracks which sessions use which plans via `sessionPlanMap`
- When "All" sessions is selected, shows most recently modified plan
- When a specific session is selected, shows that session's associated plan (or helpful empty state)

---

## [0.4.3] - 2025-12-28

### Fixed
- Keyboard shortcut `c` (clear) now properly ignores input when filter is focused
- Improved keyboard handler to use `document.activeElement` for reliable focus detection

---

## [0.4.2] - 2025-12-28

### Fixed
- Filter count now shows `X/Y` format when filter is active (e.g., `3/10` instead of just `10`)
- Plan selection persists when switching between sessions (plan is workspace-level, not session-level)
- Clear button now preserves plan selection (only clears events, sessions, and todos)

---

## [0.4.1] - 2025-12-28

### Fixed
- Version now reads dynamically from package.json instead of being hardcoded
- Added build-time version injection via esbuild

---

## 2025-12-28

### Added
- Session-specific todos with localStorage persistence
- Agent context stack - shows agent names (code-implementer, haiku-general-agent, etc.) in tool activity instead of "main"
- Distinct agent colors in tool activity (green for code-implementer, cyan for code-test-evaluator, orange for haiku-general-agent, etc.)
- Clear button (X) to remove stale session todos from localStorage
- Header session badge syncs with selected session filter
- Playwright MCP integration for browser automation testing

### Fixed
- Fixed crash when clicking THINKING pane (removed collapsibility)
- Hide todos/plan panels when "All" sessions is selected

---

## 2025-12-23

### Changed
- Replaced Agents panel with Todo panel for tracking task progress
- Updated navigation to view-based system (All/Thinking/Tools/Todo/Plan)
- Keyboard shortcuts changed from 0-9 agent switching to a/t/o/d/p view switching
- Simplified dashboard layout with session-based filtering instead of agent tabs
- Tool activity panel: collapsible entries (start collapsed), two-line collapsed view showing agent name
- Tool activity panel: removed OUTPUT section and running status indicator
- Plan viewer shows plan for selected session only; empty state when "All" sessions selected

### Added
- Todo panel displays current task list with status indicators (pending/in-progress/completed)
- Screenshot utility script for capturing Arc browser window (`pnpm screenshot`)
- Version bump automation script (`pnpm version:patch/minor/major`)
- Test script (`pnpm test`)

### Fixed
- Updated 8 test specifications to match current view-based navigation architecture
- Fixed hardcoded version in types.ts (was still 0.1.0)

---

## 2025-12-22

### Added
- Hook integration with Claude Code (PreToolUse, PostToolUse, SubagentStart, SubagentStop, SessionStart, SessionStop)
- Setup script (`scripts/setup.sh`) for automated hook installation with install/uninstall/status commands
- Universal hook dispatcher script (`hooks/thinking-monitor-hook.sh`) for forwarding events to monitor server
- Hook processor TypeScript module (`src/server/hook-processor.ts`) for converting hook inputs to MonitorEvents
- Hook types module (`src/server/hook-types.ts`) with validation and type definitions
- Secret redaction module (`src/server/secrets.ts`) with pattern-based detection for API keys, tokens, passwords
- Plan selector dropdown for switching between multiple plan files
- Right-click context menu on plans with "Open in Default App" and "Reveal in Finder" actions
- Server-side file action API endpoint for secure file operations
- Plan list event type for syncing available plans to dashboard
- Toolbar buttons (Open, Reveal) in Plan panel header for quick file actions
- Keyboard shortcuts: `Cmd+O` to open plan, `Cmd+Shift+R` to reveal in Finder
- Toast notifications for file action feedback (success/error)
- Security tests for file action API (path validation, directory traversal prevention)

### Fixed
- TypeScript unused variable warning (cleanup from Phase 1 evaluation)
- Connection overlay now only covers content area, allowing navigation tabs to remain clickable during reconnection

### Changed
- Tool inputs and outputs are now redacted for secrets before broadcasting
- Working directory paths are redacted in session events

---

## 2025-12-21

### Added
- Initial project setup with TypeScript and pnpm
- Project structure for server, dashboard, hooks, and scripts
- README with architecture overview and usage instructions
- Security-first design documented in PRD
- Two-agent development workflow (code-implementer, code-test-evaluator)
- WebSocket server with Origin validation and client tracking
- HTTP event receiver endpoint for Claude Code hooks
- Static file server for dashboard
- Web dashboard with dark theme and 4-panel layout (Thinking, Tools, Agents, Plan)
- Real-time WebSocket connection with auto-reconnect
