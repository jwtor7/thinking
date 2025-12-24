# Changelog

## 2025-12-23

### Changed
- Replaced Agents panel with Todo panel for tracking task progress
- Updated navigation to view-based system (All/Thinking/Tools/Todo/Plan)
- Keyboard shortcuts changed from 0-9 agent switching to a/t/o/d/p view switching
- Simplified dashboard layout with session-based filtering instead of agent tabs

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
