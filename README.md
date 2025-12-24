# Thinking Monitor

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥22-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.x-orange?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Real-time monitoring dashboard for Claude Code thinking, agents, and tool activity.

## Features

- **Thinking Panel** - Live stream of Claude's reasoning process
- **Tool Activity** - Track tool calls (Read, Edit, Bash, etc.) in real-time
- **Agent Tracking** - Monitor main session and subagents with status
- **Plan Viewer** - Display active plan files
- **Multi-Agent Switching** - Toggle between concurrent agent thinking streams
- **Click-to-Open** - Open thinking/plans in your Markdown Viewer app

## Requirements

- Node.js >= 22.0.0
- pnpm
- Claude Code CLI

## Installation

```bash
# Install dependencies
pnpm install

# Install Claude Code hooks
./scripts/setup.sh --install
```

The setup script registers hooks with Claude Code by updating `~/.claude/settings.json`.

### Setup Commands

```bash
./scripts/setup.sh --install    # Install hooks
./scripts/setup.sh --uninstall  # Remove hooks
./scripts/setup.sh --status     # Check installation status
```

## Usage

```bash
# Development (with auto-reload)
pnpm dev

# Production
pnpm build
pnpm start
```

Then open `http://localhost:3356` in your browser.

### How It Works

1. Start the monitor server (`pnpm dev`)
2. Open a new Claude Code session (hooks are active per-session)
3. The dashboard receives real-time events as Claude uses tools and spawns agents

## Architecture

```
Claude Code Session
        │
        ├── Hooks (Pre/PostToolUse, SubagentStart/Stop)
        │         │
        │         ▼
        │   HTTP POST to localhost:3355
        │
        ├── Transcript Watcher (.jsonl files)
        │         │
        │         ▼
        │   Parse thinking blocks
        │
        └── Plan Watcher (~/.claude/plans/*.md)
                  │
                  ▼
         WebSocket Hub (broadcast)
                  │
                  ▼
         Web Dashboard (localhost:3356)
```

## Security

- Binds to `127.0.0.1` only (localhost)
- No persistent storage of events
- Secrets are redacted before display
- Path validation for file access
- XSS prevention via HTML escaping

## Recent Changes

### 2025-12-23
- Replaced Agents panel with Todo panel for task tracking
- View-based navigation (a/t/o/d/p keyboard shortcuts)
- Screenshot utility for Arc browser

### 2025-12-22
- Hook integration with Claude Code (6 hook types)
- Setup script for automated hook installation
- Secret redaction module for secure event broadcasting

### 2025-12-21
- Initial project setup with TypeScript and pnpm

*For complete history, see [CHANGELOG.md](./CHANGELOG.md)*

## License

MIT
