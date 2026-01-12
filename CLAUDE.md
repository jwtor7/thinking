# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (rebuild + watch mode)
pnpm dev

# Build everything (server + dashboard)
pnpm build

# Start production server (kills existing, runs foreground)
pnpm start

# Build + restart as background daemon (use after code changes)
pnpm ship

# Type checking only
pnpm typecheck

# Run all tests
pnpm test

# Run single test file
npx vitest run src/server/secrets.test.ts

# Hook management
./scripts/setup.sh --install    # Register hooks with Claude Code
./scripts/setup.sh --uninstall  # Remove hooks
./scripts/setup.sh --status     # Check hook status
```

## Architecture

Real-time dashboard that visualizes Claude Code's thinking, tool usage, and agent activity.

### Data Flow

```
Claude Code Hooks → HTTP POST /event (3355) → EventReceiver → WebSocketHub → Dashboard
                                                    ↓
TranscriptWatcher (polls ~/.claude/projects/*/sessions/*/transcript.jsonl)
                                                    ↓
PlanWatcher (watches ~/.claude/plans/*.md) ────────→ WebSocketHub → Dashboard (3356)
```

### Server Components (src/server/)

| Module | Purpose |
|--------|---------|
| `index.ts` | Entry point, orchestrates all components |
| `event-receiver.ts` | HTTP endpoint for hook events |
| `websocket-hub.ts` | WebSocket server, broadcasts to dashboard |
| `hook-processor.ts` | Transforms hook JSON → MonitorEvent |
| `transcript-watcher.ts` | Polls transcript files for thinking blocks |
| `plan-watcher.ts` | Watches ~/.claude/plans/ for file changes |
| `secrets.ts` | Redacts API keys/tokens before broadcast |
| `static-server.ts` | Serves dashboard on port 3356 |

### Dashboard Components (src/dashboard/)

| Module | Purpose |
|--------|---------|
| `app.ts` | Main entry, initializes all modules |
| `handlers/dispatcher.ts` | Routes events to appropriate handlers |
| `handlers/thinking.ts` | Renders thinking blocks |
| `handlers/tools.ts` | Renders tool calls with timing |
| `handlers/todos.ts` | Manages TodoWrite state |
| `handlers/plans.ts` | Plan file viewer |
| `connection/websocket.ts` | WebSocket client, reconnection logic |
| `state.ts` | Global state (sessions, agents, filters) |

### Shared Types (src/shared/types.ts)

All event types are defined here and shared between server and dashboard. Key types:
- `MonitorEvent` - Base event interface
- `StrictMonitorEvent` - Discriminated union for type-safe handling
- Event-specific: `ToolStartEvent`, `ToolEndEvent`, `ThinkingEvent`, `AgentStartEvent`, etc.

## Development Workflow

Uses two-agent pattern: `code-implementer` → `code-test-evaluator`

## Server Ports

| Service | Port |
|---------|------|
| Dashboard | 3356 |
| WebSocket + Events | 3355 |

## Security Requirements

- Localhost-only binding (127.0.0.1)
- Secrets redacted via `secrets.ts` before broadcast
- XSS prevention (HTML-escape all rendered content)
- Path validation (only ~/.claude/ or temp directories)

## Versioning (MANDATORY)

Every code change requires version bump:

```bash
# 1. Bump version
./scripts/bump-version.sh patch|minor|major

# 2. Edit CHANGELOG.md with actual changes

# 3. Update README.md Recent Changes section

# 4. Commit
git add -A && git commit -m "vX.X.X: Brief description"

# 5. After push, rebuild server
pnpm ship
```

| Type | When |
|------|------|
| `patch` | Bug fixes, small improvements |
| `minor` | New features (backward compatible) |
| `major` | Breaking changes |
