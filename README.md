# Thinking Monitor

**See inside Claude's mind.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥22-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-0.9.1-purple)](./CHANGELOG.md)

A real-time dashboard that visualizes Claude Code's thinking process, tool usage, and agent activity as it happens.

![Thinking Monitor Dashboard](docs/screenshot.png)

---

## Why

Claude Code is powerful, but opaque. You see the output, not the process. Thinking Monitor changes that—watch Claude reason through problems, track every tool call, and understand how agents coordinate in real-time.

---

## Features

| Panel | What You See |
|-------|--------------|
| **Thinking** | Live stream of Claude's reasoning with collapsible entries |
| **Tools** | Every tool call with timing, inputs, and outputs |
| **Todo** | Task progress (pending → in-progress → completed) |
| **Plan** | Active plan files with quick-open and reveal |

**Plus:**
- Session filtering across all panels
- Keyboard shortcuts for everything
- Collapsible panels with state persistence
- Right-click to open files in editor or Finder
- Secret redaction (API keys, tokens, passwords)

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
| `a` `t` `o` `d` `p` | Switch view (All, Thinking, Tools, Todo, Plan) |
| `Shift` + `t` `o` `d` `p` | Collapse/expand panel |
| `c` | Clear all entries |
| `s` | Toggle auto-scroll |
| `/` | Focus search |
| `Cmd+O` | Open selected plan |
| `Cmd+Shift+R` | Reveal plan in Finder |

---

## Security

- **Localhost only** — binds to `127.0.0.1`, not exposed to network
- **No persistence** — events exist only in memory
- **Secret redaction** — API keys, tokens, passwords automatically masked
- **Path validation** — file access restricted to `~/.claude/`
- **XSS prevention** — all content HTML-escaped before render

---

## Requirements

- Node.js ≥ 22
- pnpm
- Claude Code CLI

---

## Recent Changes

- **v0.9.1** — Bug fixes: CONFIG-based origins, async error boundaries, unused imports
- **v0.9.0** — Log levels, security hardening, performance optimization, cross-platform support
- **v0.8.0** — Modular architecture (16 focused modules from monolithic 3,247-line file)

*[Full changelog →](./CHANGELOG.md)*
