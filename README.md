# Thinking Monitor

**See inside Claude's mind.**

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥22-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.3.4-purple)](./CHANGELOG.md)
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
| `l` `t` `o` `a` `h` `p` `k` `m` | Switch view (Timeline, Thinking, Tools, Agents, Hooks, Plan, Tasks, Team) |
| `Shift` + `l` `t` `o` `a` `h` `m` `k` | Collapse/expand panel (Timeline, Thinking, Tools, Agents, Hooks, Team, Tasks) |
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

- **v1.3.4** (2026-02-10 19:31) — Subagent transcript support: TranscriptWatcher now discovers nested subagent files; collapsible team sections; fixed Thinking Monitor.app launch path issue.
- **v1.3.3** (2026-02-09 15:40) — Improved stats bar tooltips: extracted text to constant, unified attribute handling, and fixed duration formatting for fractional milliseconds.
- **v1.3.2** (2026-02-09 15:21) — Cleaned up session resolution code: extracted ALL_SESSIONS constant to eliminate magic string literals, simplified redundant session-change detection in selectSession().
- **v1.3.1** (2026-02-08 17:24) — Removed unused resizer functionality and simplified dashboard UI layer; cleaned up duplicate event handlers; added output/ to .gitignore.
- **v1.3.0** (2026-02-08 16:59) — Timeline-first navigation: default view changed to Timeline, unified session filtering, stale agent filter cleanup on session switch, keyboard shortcut hints on collapse buttons, 8 new navigation behavior tests.

*[Full changelog →](./CHANGELOG.md)*
