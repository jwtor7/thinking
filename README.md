# Thinking Monitor

**See inside Claude's mind.**

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥22-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.2.2-purple)](./CHANGELOG.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/jwtor7/thinking?style=social)](https://github.com/jwtor7/thinking)

A real-time dashboard that visualizes Claude Code's thinking process, tool usage, and agent activity as it happens.

![Thinking Monitor Dashboard](docs/screenshot.png)

---

## Why

Claude Code is powerful, but opaque. You see the output, not the process. Thinking Monitor changes that — watch Claude reason through problems, track every tool call, and understand how agents coordinate in real-time. It's the developer tools experience for AI-assisted coding.

---

## Features

| Panel | What You See |
|-------|--------------|
| **Thinking** | Live stream of Claude's reasoning with collapsible entries |
| **Tools** | Every tool call with timing, inputs, and outputs |
| **Plan** | Active plan files with quick-open and reveal |
| **Team** | Agent teams with member grid, status indicators, inter-agent message timeline |
| **Tasks** | Three-column kanban board (Pending / In Progress / Completed) with task cards |
| **Timeline** | Unified chronological feed across all event types with type icons and agent badges |

**Plus:**
- Nested agent hierarchy tree with click-to-filter
- Per-agent event filtering across all panels
- Cross-panel linking (click to navigate between related entries)
- Hook PRE+POST grouping (merges paired hook events)
- Tab count badges showing live event counts
- Single-column vertical layout with resizable panels
- Session filtering across all panels
- Keyboard shortcuts for everything
- Collapsible panels with drag-to-reorder
- Right-click to open files in editor or Finder
- Secret redaction (API keys, tokens, passwords)
- GFM markdown table rendering
- Stats bar with top tools, duration percentiles, and event rate
- Global search (Cmd+K) across all panels

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/jwtor7/thinking.git
cd thinking
pnpm install

# Register hooks with Claude Code
./scripts/setup.sh --install

# Start the monitor
pnpm dev
```

Open **http://localhost:3356** and start a Claude Code session. Watch the magic.

---

## How It Works

![Architecture Diagram](docs/architecture.png)

Thinking Monitor hooks into Claude Code's lifecycle events. When Claude Code runs, it fires hooks at key moments — before and after tool calls, when thinking blocks are produced, when agents start and stop. These hooks POST JSON events to a local server on port 3355.

The server validates, redacts secrets from, and broadcasts each event over WebSocket to any connected dashboard clients. The dashboard (served on port 3356) renders events in real time across its seven panels, giving you a live view of everything Claude is doing.

A separate transcript watcher polls Claude Code's session files for thinking blocks and other data that hooks don't capture, ensuring comprehensive coverage of the AI's activity.

---

## Configuration

### Environment Variables

| Variable | Default | Options |
|----------|---------|---------|
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` |

```bash
LOG_LEVEL=warn pnpm start   # Quiet
LOG_LEVEL=debug pnpm start  # Verbose
```

### Setup Commands

```bash
./scripts/setup.sh --install    # Register hooks
./scripts/setup.sh --uninstall  # Remove hooks
./scripts/setup.sh --status     # Check status
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `t` `o` `h` `m` `k` `l` `a` `p` | Switch view (Thinking, Tools, Hooks, Team, Tasks, Timeline, Agents, Plan) |
| `Shift` + `t` `o` `h` `m` `k` `l` `a` | Collapse/expand panel |
| `Shift+P` | Open panel visibility settings |
| `c` | Clear all entries |
| `s` | Toggle auto-scroll |
| `/` | Focus search |
| `Cmd+K` | Global search |
| `Cmd+O` | Open selected plan |
| `Cmd+Shift+R` | Reveal plan in Finder |

---

## Security

Thinking Monitor is **localhost-only by design**. It binds exclusively to `127.0.0.1` and is never exposed to the network. All data stays on your machine.

- **No persistence** — events exist only in memory during the session
- **Secret redaction** — API keys, tokens, and passwords are automatically masked before display
- **Path validation** — file operations are restricted and normalized to prevent traversal
- **XSS prevention** — all content is HTML-escaped before rendering
- **CSP headers** — Content-Security-Policy for defense-in-depth protection
- **CSRF protection** — Origin header validation on all mutating requests
- **Rate limiting** — protects against local denial-of-service

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

---

## Requirements

- Node.js ≥ 22
- pnpm
- Claude Code CLI

### Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | Fully supported | Primary development platform |
| **Linux** | Fully supported | All features work natively |
| **Windows** | Partial | Server and dashboard work via Node.js. Shell scripts (`setup.sh`, `mock-data.sh`) require WSL or Git Bash. File-open actions use `explorer /select,` natively. |

The core server uses cross-platform Node.js APIs (`path.join`, `os.homedir`) throughout. Windows users can run the dashboard and server without issues — the main gap is that hook installation and utility scripts are bash-only.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing, and PR guidelines.

---

## Disclaimer

Thinking Monitor is an **unofficial community tool**. It is not affiliated with, endorsed by, or supported by Anthropic. Use at your own risk. This software is provided as-is with no warranty — see the [LICENSE](./LICENSE) for details.

---

## License

[MIT](./LICENSE) — Copyright (c) 2025-2026 Junior Williams

---

## Recent Changes

- **v1.2.2** (2026-02-08 15:16) — Replaced bash scripts with portable Node.js equivalents, made watchers path-configurable for test isolation, and aligned keyboard shortcuts and docs with current dashboard state.
- **v1.2.1** (2026-02-08 14:32) — Fixed EventReceiver interval cleanup to prevent timer leaks when instances are destroyed and recreated; added co-located test for lifecycle behavior.
- **v1.2.0** (2026-02-07 23:15) — Merged Codex refactoring: new path-validation and change-detection modules, JSON structured logging, expanded secret detection, WebSocket hardening, and fixed completed task retention on dashboard.
- **v1.1.4** (2026-02-07 22:10) — Fixed timeline events showing wrong timestamps and unattributed plan/team events; now uses original detection timestamps and resolves session context.
- **v1.1.3** (2026-02-07 16:01) — Fixed team events rendering for wrong session: `handleTeamUpdate`, `handleTeammateIdle`, and `handleMessageSent` now check session context before rendering.

*[Full changelog →](./CHANGELOG.md)*
