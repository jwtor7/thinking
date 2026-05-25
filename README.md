# Thinking Monitor

**Observability for AI agents running with elevated privileges.**

*A research instrument for visualizing AI coding assistant reasoning, tool calls, hook lifecycle, and multi-agent coordination in real time. Built to make agent behavior observable enough to govern, audit, and debug.*

[![Status: Research instrument, v1 paused](https://img.shields.io/badge/status-research%20instrument%2C%20v1%20paused-orange.svg)](#status-research-instrument-v1-paused)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥22-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-2.1.0-purple)](./CHANGELOG.md)
[![Made in Canada](https://img.shields.io/badge/made%20in-Canada-red.svg)](https://www.cyber.gc.ca/)
[![GitHub Stars](https://img.shields.io/github/stars/jwtor7/thinking?style=social)](https://github.com/jwtor7/thinking)

> ## Status: Research instrument, v1 paused
>
> Thinking Monitor v1 was a single-maintainer prototype built to make AI agent runtime behavior observable. The v1 codebase is paused while the research line it opened (tamper-evident audit trails for agent actions, policy enforcement at the runtime boundary, secrets redaction in the prompt and tool-output pipeline) continues in client engagements and in a proposed Catalyst-fellowship research program (2026-2027). Fork freely; the design language is intentionally portable.
>
> In the meantime, I've moved to other autonomous agent harnesses for my current research. A note on that: I'm comfortable operating this way because I have years of hands-on experience reading agent behavior, recognizing failure modes, and intervening when something looks wrong. Running agents autonomously without that background carries materially different risk. My setup is a researcher's choice, not a general recommendation.

**Author:** Junior Williams, Principal Enterprise Architect (BITSUMMIT). CISSP, GCIH, CCSK, GSEC, SSCP. Standards Council of Canada Mirror Committees: ISO/IEC JTC 1/SC 42 (AI) and SC 27 (Information security). Toronto. Full bio below.

![Thinking Monitor Dashboard](docs/screenshot.png)

---

## Why this exists

Organizations are deploying AI coding assistants (Claude Code, GitHub Copilot, Cursor) that execute with elevated privileges: modifying source code, running terminal commands, accessing credentials, and making API calls on behalf of the developer. Unlike traditional software, these systems make autonomous decisions in real time based on reasoning that is invisible to the security teams responsible for the environments they run in.

Thinking Monitor was built to close that visibility gap. It captures the full trace of an AI agent's activity (reasoning, tool calls, hook lifecycle events, sub-agent delegation) and presents it as a real-time, filterable dashboard. The intent is to make agentic behavior observable enough that humans can govern it, auditors can review it, and developers can debug it.

---

## Research context

This project intersects three active conversations in Canadian and global AI security:

- **AI agent governance and trust frameworks**: OWASP Agentic Top 10, NIST AI Risk Management Framework (AI 100-1) with the Generative AI Profile (NIST AI 600-1), ISO/IEC 23894 (AI risk management), ISO/IEC 42001 (AI management systems), and ISO/IEC 27001/27002 as the underlying information-security management baseline
- **Least-privilege and runtime-boundary controls for autonomous systems**: localhost-only binding (reduces attack surface, not zero-trust per se), no persistence, tamper-evident audit trails, policy enforcement at the runtime boundary
- **Secure-by-default tooling for AI-assisted software development**: secrets redaction, prompt and tool-output sanitization, chain-of-custody for agent actions

The patterns this project explored, including tamper-evident logging of agent tool calls, policy enforcement at the agent runtime boundary, and secrets redaction in prompt and tool-output pipelines, have informed how I now architect agent deployments in client environments. The dashboard itself is paused. The patterns are now embedded in how I architect agent deployments for clients.

Taken together, these threads sit under the broader heading of AI trust frameworks: the technical and governance scaffolding that lets organizations adopt agentic AI without losing the audit trail of what the agents did and why.

---

## Who this is for

| Stakeholder | What this was designed for |
|-------------|---------------------------|
| **Standards bodies (SC 27, SC 42)** | A working reference implementation for agent observability under emerging ISO/IEC 42001 controls |
| **Enterprise security architects** | A model for instrumenting agent runtimes where audit and tamper-evident logging are non-negotiable |
| **AI security researchers** | A substrate for studying agent behavioral patterns with timestamped, tamper-evident traces |
| **Catalyst Fellowship and academic reviewers** | The instrumentation artifact behind the Fellowship proposal, preserved for review |

---

## Features

| Panel | What You See |
|-------|--------------|
| **Thinking** | Live stream of Claude's reasoning with collapsible entries |
| **Tools** | Every tool call with timing, inputs, and outputs |
| **Plan** | Active plan files with quick-open and reveal |
| **Team** | Unified collaboration view: members, hierarchy, session-scoped agent list/thinking detail, and inter-agent messages |
| **Tasks** | Three-column kanban board (Pending / In Progress / Completed) with task cards |
| **Timeline** | Unified chronological feed across all event types with type icons and agent badges |

**Plus:**
- Nested agent hierarchy tree with click-to-filter
- Per-agent event filtering across all panels
- Cross-panel linking (click to navigate between related entries)
- Hook PRE+POST grouping (merges paired hook events)
- Tab count badges showing live event counts
- Single-view panel layout with collapsible sections
- Session filtering across all panels
- Stable default `pnpm dev` startup path with optional `pnpm dev:watch` hot-reload mode
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

Open **http://localhost:3356** and start a Claude Code session. The dashboard will populate in real time as hooks fire.

---

## How It Works

![Architecture Diagram](docs/architecture.png)

Thinking Monitor hooks into Claude Code's lifecycle events. When Claude Code runs, it fires hooks at key moments (before and after tool calls, when thinking blocks are produced, when agents start and stop), and those hooks POST JSON events to a local server.

The server validates, redacts secrets from, and broadcasts each event over WebSocket to any connected dashboard clients. The dashboard renders events in real time across its seven panels, giving you a live view of everything Claude is doing.

Port numbers, transport details, and the transcript-watcher fallback are documented in the source for contributors.

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
| `l` `t` `o` `a` `h` `p` `k` `m` | Switch view (Timeline, Thinking, Tools, Team alias, Hooks, Plan, Tasks, Team) |
| `Shift` + `l` `t` `o` `a` `h` `m` `k` | Collapse/expand panel (Timeline, Thinking, Tools, Team alias, Hooks, Team, Tasks) |
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

- **No persistence**: events exist only in memory during the session
- **Secret redaction**: API keys, tokens, and passwords are automatically masked before display
- **Path validation**: file operations are restricted and normalized to prevent traversal
- **XSS prevention**: all content is HTML-escaped before rendering
- **CSP headers**: Content-Security-Policy for defense-in-depth protection
- **CSRF protection**: Origin header validation on all mutating requests
- **Rate limiting**: protects against local denial-of-service

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

The core server uses cross-platform Node.js APIs (`path.join`, `os.homedir`) throughout. Windows users can run the dashboard and server without issues; the main gap is that hook installation and utility scripts are bash-only.

---

## Contributing

The project is on hold (see the [Status](#status-research-instrument-v1-paused) note at the top of this README), so I'm not actively reviewing pull requests right now. If you fork this and build something interesting, open an issue or reach out, I would like to hear about it. For development setup and the original PR guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## About the author

Junior Williams is a Principal Enterprise Architect at the intersection of cybersecurity and AI, currently leading secure AI deployment, configuration, and compliance work for enterprise and public-sector clients at BITSUMMIT, and delivering independent advisory engagements through Junior Williams Consulting Inc. (JWC). His work spans vCISO engagements for critical-infrastructure clients, enterprise security roadmaps aligned with PCI DSS, ISO/IEC 27001, and NIST CSF, and AI security architecture for organizations adopting agentic systems. He holds CISSP, GCIH, CCSK, GSEC, and SSCP certifications. Based in Toronto.

### Standards and advisory roles

Member of the Standards Council of Canada Mirror Committees for ISO/IEC JTC 1/SC 42 (Artificial Intelligence) and SC 27 (Information security, cybersecurity and privacy protection). This work contributes to the Canadian national position on international AI and information-security standards, including the ISO/IEC 42001 (AI management systems) family that anchors the research context of this project.

Industrial Advisory Board member for an NSERC CREATE program in cybersecurity and AI, supporting graduate training and research direction at Dalhousie University and Memorial University.

Member of the [AIUC-1 consortium](https://www.aiuc-1.com/consortium) and contributor to [AIUC-1 control B006, "Prevent unauthorized AI agent actions,"](https://www.aiuc-1.com/evidence) the framework's mandatory requirement for runtime containment of agent capabilities, technical access restrictions, monitoring and alerting, and pre-execution authorization hooks. This control is the direct policy analogue of what Thinking Monitor v1 was built to instrument.

Advisory board member of the Canadian Cybersecurity Network (CCN), contributing to CCN reports and published commentary, including coverage in the Financial Post.

Member of CSA Group (Canadian Standards Association), supporting Canadian national standards adoption in cybersecurity and AI.

### Active research and practitioner work

Currently leading post-quantum cryptography migration planning for enterprise clients with significant cryptographic exposure. PQC migration is a multi-year program for any organization with long-lived cryptographic dependencies, and the planning work has to begin well before the new algorithms are running in production. Engagement scope is client-confidential; public commentary on PQC readiness, crypto-agility patterns, and the NIST and CSE/CCCS guidance landscape will follow.

Architect of secure AI deployment patterns for enterprise and public-sector clients, covering agent runtime isolation, secrets handling in prompt and tool-output pipelines, retrieval-augmented generation with provenance controls, and least-privilege boundaries between AI systems and the data they read. The patterns explored in Thinking Monitor v1, including tamper-evident logging, policy enforcement at the runtime boundary, and secrets redaction in the prompt and tool-output pipeline, are the substrate of this work.

### Public scholarship and speaking

Author of a Zenodo-published paper proposing "Williams' Law," a framework for modeling AI capability gains from algorithmic improvements (distinct from compute-scaling laws like Kaplan 2020 and Chinchilla 2022), and of papers on IT/OT collaboration in critical-infrastructure security. Speaker at SecTor and adjacent Canadian cybersecurity events on AI security, post-quantum readiness, and operational resilience. Regular public commentary on AI governance, agent security, and the operational implications of generative AI in enterprise environments. Former professor at Toronto School of Management (2023-2024), where AI applications in cybersecurity were integrated into curricula aligned with NIST CSF, ISO 27001, and GDPR.

---

## Disclaimer

Thinking Monitor is an **unofficial community tool**. It is not affiliated with, endorsed by, or supported by Anthropic. Use at your own risk. This software is provided as-is with no warranty; see the [LICENSE](./LICENSE) for details.

---

## License

[MIT](./LICENSE), Copyright (c) 2025-2026 Junior Williams

---

## Recent Changes

- **2026-05-24**: README repositioned as research instrument with v1 paused; About-the-author expanded with standards and advisory roles, active research and practitioner work, and public scholarship sections; standards stack extended to NIST AI 600-1 and ISO/IEC 27001/27002; stakeholder framing aligned to peer audience; GitHub metadata refreshed; v2.1.0 cut to mark the repositioning.
- **v1.8.1** (2026-03-30 00:21): Task view fix: UUID session resolution, empty dir suppression, completion log from task_update events, session-scoped filtering, correct peak metric, header count, ID display in completions.
- **v1.8.0** (2026-03-29 16:50): Tasks and Teams view redesign: Tasks replaced kanban with compact active-work rows + completion log with duration pills; Teams replaced 4 sections with agent lifecycle Gantt strip, NxN communication heat matrix, and enhanced message filtering.

*For complete history, see [CHANGELOG.md](./CHANGELOG.md)*
