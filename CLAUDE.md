# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (rebuild dashboard + watch server with --experimental-transform-types)
pnpm dev

# Build everything (server + dashboard)
pnpm build

# Build + restart as background daemon (use after code changes)
pnpm ship

# Start production server (kills existing, runs foreground)
pnpm start

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

### Three Codebases in One Repo

The project has three distinct build targets sharing one `tsconfig.json`:

| Target | Entry Point | Build Tool | Output | Runtime |
|--------|-------------|------------|--------|---------|
| **Server** | `src/server/index.ts` | esbuild (Node platform, ESM) | `dist/server/index.js` | Node.js ≥22 |
| **Dashboard** | `src/dashboard/app.ts` | esbuild (browser, IIFE) | `src/dashboard/app.js` | Browser |
| **Shared** | `src/shared/types.ts` | Imported by both | N/A | Both |

The server build injects `__PACKAGE_VERSION__` at build time via esbuild `define`. In dev mode (`pnpm dev`), the server runs with `--experimental-transform-types` and reads version from `package.json` at runtime instead.

### Dashboard Architecture

The dashboard uses a dependency injection pattern — `app.ts` initializes each handler/UI module by calling `init*()` functions with callback objects. Handlers don't import each other directly; they communicate through callbacks passed at init time. This avoids circular dependencies between handlers.

Key patterns:
- `state.ts` holds all mutable global state (sessions, agents, filters, todos)
- `handlers/dispatcher.ts` routes incoming WebSocket events by `event.type`
- UI modules in `ui/` manage DOM interactions (panels, keyboard, drag-reorder, etc.)
- `storage/persistence.ts` handles localStorage save/restore

### Shared Types

All event types live in `src/shared/types.ts` and are shared between server and dashboard:
- `MonitorEvent` — Base event interface (loose, allows extra properties)
- `StrictMonitorEvent` — Discriminated union for type-safe `switch` on `event.type`
- Server re-exports these from `src/server/types.ts` which also defines `CONFIG`

### Hook System

Claude Code hooks (configured in `~/.claude/settings.json`) POST JSON to `http://127.0.0.1:3355/event`. The `EventReceiver` validates origin, parses the payload, and passes it through `HookProcessor` which transforms raw hook JSON into typed `MonitorEvent` objects. Events are then broadcast via `WebSocketHub` to all connected dashboard clients.

## Development Workflow

Uses two-agent pattern: `code-implementer` (writes code) → `code-test-evaluator` (tests and reviews). Both agents are defined in `.claude/agents/`.

## Server Ports

| Service | Port |
|---------|------|
| WebSocket + Events | 3355 |
| Dashboard (static) | 3356 |

## Testing

Tests are co-located with source files (`*.test.ts` next to the module they test). Uses vitest. No setup/teardown files — tests are self-contained.

## Security Requirements

- Localhost-only binding (127.0.0.1)
- Secrets redacted via `secrets.ts` before broadcast (pattern-based, with ReDoS protection)
- XSS prevention (HTML-escape all rendered content)
- CSP headers on static server
- CORS origin validation on event endpoint
- Path validation (only ~/.claude/ or temp directories)

## Versioning (MANDATORY)

Every code change requires version bump. The bump script updates `package.json`, `src/server/types.ts`, and `CHANGELOG.md`:

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
