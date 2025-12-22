# Changelog

## 2025-12-22

### Added
- Hook integration with Claude Code (PreToolUse, PostToolUse, SubagentStart, SubagentStop, SessionStart, SessionStop)
- Setup script (`scripts/setup.sh`) for automated hook installation with install/uninstall/status commands
- Universal hook dispatcher script (`hooks/thinking-monitor-hook.sh`) for forwarding events to monitor server
- Hook processor TypeScript module (`src/server/hook-processor.ts`) for converting hook inputs to MonitorEvents
- Hook types module (`src/server/hook-types.ts`) with validation and type definitions
- Secret redaction module (`src/server/secrets.ts`) with pattern-based detection for API keys, tokens, passwords

### Fixed
- TypeScript unused variable warning (cleanup from Phase 1 evaluation)

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
