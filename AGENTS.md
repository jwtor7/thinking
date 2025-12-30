# Repository Guidelines

This repository hosts the Thinking Monitor, a TypeScript-based local dashboard and server that track Claude Code activity. Use this guide to keep changes consistent with existing structure and workflows.

## Project Structure & Module Organization

- `src/server/` Node server runtime (event receiver, watchers, WebSocket hub, security helpers).
- `src/dashboard/` browser UI (entry at `src/dashboard/app.ts`, styles in `src/dashboard/styles.css`, UI components under `src/dashboard/ui/`).
- `hooks/` Claude Code hook scripts installed by `./scripts/setup.sh`.
- `scripts/` build tooling, setup, and version bump helpers.
- `dist/` compiled output from builds.
- Tests live alongside code as `*.test.ts` in `src/server/` and `src/dashboard/`.

## Build, Test, and Development Commands

- `pnpm dev` - Build the dashboard, then run the server with Node watch mode.
- `pnpm dev:watch` - Watch the dashboard bundle and server simultaneously.
- `pnpm build` - Build server and dashboard bundles.
- `pnpm start` - Run the production server from `dist/`.
- `pnpm typecheck` - Run TypeScript in strict no-emit mode.
- `pnpm test` - Execute Vitest test suite once.
- `./scripts/setup.sh --install` - Install Claude Code hooks into `~/.claude/settings.json`.

## Coding Style & Naming Conventions

- TypeScript (ESM) with strict compiler options; prefer `.ts` import extensions.
- 2-space indentation is used across the codebase.
- Files are `kebab-case.ts` (examples: `websocket-hub.ts`, `rate-limiter.ts`).
- Use `PascalCase` for classes and `camelCase` for functions/variables.

## Testing Guidelines

- Framework: Vitest (`pnpm test`).
- Name tests `*.test.ts` and keep them near the module under test.
- There is no explicit coverage gate; add tests for new logic and security checks.

## Commit & Pull Request Guidelines

- Commit messages are descriptive and often version-prefixed, e.g. `v0.8.0: Major refactoring...` or `Update README with ...`.
- Before any commit, bump the version and update the changelog:
  - `./scripts/bump-version.sh patch|minor|major`
  - Update `CHANGELOG.md` with today's date and a short entry.
- PRs should include a clear summary, testing notes, and screenshots for dashboard UI changes.

## Security & Configuration Tips

- Keep all servers bound to `127.0.0.1` and avoid logging secrets.
- HTML output must be escaped and file paths validated against allowed locations.
- Use the setup script for hooks; manual edits to `~/.claude/settings.json` are discouraged.
