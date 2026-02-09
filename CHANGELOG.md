# Changelog

## 2026-02-09 — v1.3.2

#### 15:21
### Changed
- **Extracted ALL_SESSIONS constant** — Eliminated magic string `'all'` by defining `ALL_SESSIONS` constant in `state.ts` and using it throughout handlers (12 occurrences replaced across `sessions.ts`, `timeline.ts`)
- **Simplified session-change detection** — Removed redundant double-check logic in `selectSession()` that compared both raw and canonical IDs; now uses single comparison against `resolvedSessionId` for clearer intent

---

## 2026-02-08 — v1.3.1

#### 17:24
### Changed
- **Removed unused resizer functionality** — Simplified dashboard UI layer by removing resizable-panes logic, stale resize handlers, and related CSS; dashboard now operates in single-view mode with fixed panel heights
- **Cleaned up duplicate event handlers** — Unified handleMouseMove/handleMouseUp naming in drag-reorder module to eliminate naming conflicts
- **Simplified DOM insertion logic** — Removed resizer-aware insertion targeting in drag-reorder handler

### Fixed
- Added `output/` to `.gitignore` to exclude generated files from version control

---

## 2026-02-08 — v1.3.0

### Added
- **Timeline-first navigation** — Dashboard now defaults to Timeline view, prioritizing chronological context over single-panel thinking
- **Keyboard shortcut hints** — Panel collapse buttons show shortcut key in tooltip for discoverability
- **Navigation behavior tests** — 8 static analysis tests validating default view, tab order, session preservation, filter cleanup, and shortcut hints

### Changed
- **Default view** — Changed from Thinking to Timeline as the landing view
- **Tab order** — Reordered to timeline-first across panel selector, views, and keyboard help
- **Unified session filtering** — Extracted `applySessionFilter()` to replace duplicated `applyThinkingFilter()`/`applyToolsFilter()` logic
- **Stale agent filter cleanup** — Session switching now clears incompatible agent filters to prevent empty panel views
- **Session context preservation** — Clicking timeline thinking entries switches session context before navigating to Thinking view
- **Extracted `getPanelShortcutKey()` helper** — Centralized shortcut key lookup, replacing hardcoded ternary chains

---

## 2026-02-08 — v1.2.3

#### 15:39
### Fixed
- **ship.js orphaned process detection** — Added `lsof` port check as fallback when no PID file exists, enabling detection and cleanup of old bash-era server processes that predate the PID-file system

### Added
- **Thinking Monitor.app macOS app bundle** — Created Spotlight-launchable app in /Applications with custom brain icon (Swift-generated .icns), runs `pnpm ship` and opens Safari dashboard
- **think zsh alias** — Added `think` alias in ~/.zshrc for quick dashboard launch

---

## 2026-02-08 — v1.2.2

### Changed
- **Replaced bash scripts with portable Node.js equivalents** — Replaced `bump-version.sh`, `ship` workflow bash scripts, and `dev` watch process with `scripts/bump-version.js`, `scripts/ship.js`, and `scripts/dev-watch.js` for cross-platform PID-file daemon management and process handling.
- **Made TeamWatcher, PlanWatcher, and TranscriptWatcher path-configurable** — Added optional directory overrides to all three watchers for test isolation while preserving default `~/.claude` runtime behavior.
- **Updated keyboard shortcuts and panel references in CLAUDE.md** — Corrected shortcuts to match current dashboard state (Tasks/Agents views, session-scoped tab wording).
- **Fixed CLAUDE.md `pnpm start` description** — Removed incorrect note about "kills existing" processes.

### Fixed
- **EventReceiver lifecycle test** — Strengthened test to verify the exact interval handle is cleared in `destroy()`.

---

## 2026-02-08 — v1.2.1

### Fixed
- **EventReceiver interval cleanup** — EventReceiver now properly stores the cleanup interval handle and clears it in `destroy()` to prevent timer leaks when instances are destroyed and recreated

---

## 2026-02-07 — v1.2.0

### Added
- **Path validation module** — New `src/server/path-validation.ts` with symlink-aware path validation, extracted from `export-handler.ts` and `file-actions.ts`
- **Change detection module** — New `src/server/change-detection.ts` with SHA-256 content hashing, extracted from `plan-watcher.ts` and `team-watcher.ts`
- **JSON structured logging** — Logger now supports `LOG_FORMAT=json` for structured JSON output with `emit()` centralized function for all log events
- **Expanded secret detection** — Added OpenAI project keys, Databricks tokens, Supabase keys; improved PEM private key detection to match full BEGIN/END blocks
- **WebSocket hardening** — Message size limits and rate limiting added to `src/server/websocket-hub.ts`

### Changed
- **Logger refactored** — Centralized logging via `src/server/logger.ts` with improved Error-to-object serialization
- **Dispatcher event routing** — `src/dashboard/handlers/dispatcher.ts` refactored with try/catch wrapping for robustness
- **Activity tracker optimized** — `src/dashboard/app.ts` replaced O(n²) `Array.shift()` with index-pointer pattern for better performance
- **WebSocket null-safety** — Added optional chaining to prevent crashes on edge case events

### Fixed
- **Test alignment** — Updated `src/server/secrets.test.ts` and `src/dashboard/handlers/dispatcher.test.ts` to match refactored code structure
- **Completed task retention** — Tasks completed in Claude Code now persist on the dashboard even after task JSON files are cleaned up from disk; `handleCompletedTask` state updates are now independent of file presence
- **Audit files organized** — Moved `REPO-REVIEW.md` and `DASHBOARD-AUDIT.md` into `audit/` folder, added `audit/` to `.gitignore`

---

## 2026-02-07 — v1.1.3

### Fixed
- **Team events rendered for wrong session** — `handleTeamUpdate`, `handleTeammateIdle`, and `handleMessageSent` now check the event's session against the selected session before rendering. Previously, team events from any session would overwrite the panel regardless of which session was selected, causing stale team data (like old team names and members) to appear.
- **Team-session mapping uses event sessionId** — `resolveTeamSession` now uses the event's `sessionId` directly instead of relying solely on fragile subagent name matching. This ensures teams are correctly mapped to their source session.

---

## 2026-02-07 — v1.1.2

### Fixed
- **Stale team/tasks shown on "All Sessions"** — Team and Tasks panels (and their tabs) are now hidden when "All Sessions" is selected, matching Plan panel behavior. Prevents stale team data (like old team names and members) from showing when no specific session is active.

---

## 2026-02-07 — v1.1.1

### Fixed
- **Session chips show UUIDs** — Timeline session chips now update their label when the session's working directory resolves, instead of permanently showing a truncated UUID
- **Identical session dropdown entries** — Sessions sharing the same folder name now show start time for disambiguation (e.g., "thinking (14:35)")
- **Type chips persist as "all disabled"** — If all timeline category chips are disabled on page load, they auto-reset to enabled to prevent an empty-looking timeline
- **Session events uncategorized** — `session_start`/`session_stop` events now belong to the Agents category and respect type filters
- **Stale session auto-selected** — New sessions are auto-selected when the dashboard is on "All Sessions"; exported `autoSelectActiveSession()` for page-load recovery
- **Session chips override dropdown silently** — Timeline count now shows a tooltip explaining when session chips are overriding the global dropdown filter
- **Thinking entries lost in timeline cap** — Trimming now preferentially removes non-thinking entries, preserving rare thinking events from being displaced by tool/hook floods

---

## 2026-02-07 — v1.1.0

### Added
- **Agents view** — New dedicated panel for browsing sub-agent thinking; sidebar lists all agents with status dots and thinking counts, detail pane shows thinking entries for the selected agent
- **Timeline session chips** — Dynamic session filter chips appear as sessions emit events; click to toggle visibility (independent of global session selector); persisted to localStorage
- **Timeline click navigation** — Click a thinking entry in the timeline to switch to Thinking view, scroll to the matching entry, and flash-highlight it
- **Session-aware stats bar** — Stats bar now shows per-session metrics when a specific session is selected, aggregates when "All" is selected
- **Team session scoping** — Team panel filters by session; selecting a session shows only that session's team and hides others
- **Tasks session filtering** — Tasks kanban board filters by session using team-session mapping

### Changed
- **Timeline labels** — "main" entries now show folder/project name instead of a generic label; subagent entries show agent name; tooltips show full session path and status
- **Keyboard shortcuts** — `a` selects Agents view, `Shift+A` collapses it; todo shortcuts (`d`/`Shift+D`) removed

### Removed
- **Todo view** — Removed the broken/redundant Todo panel, handler, CSS, and all related state. Todos are fully replaced by the Tasks system (TaskCreate/TaskUpdate). Moved `detectPlanAccess` to tools handler.

---

## 2026-02-07 — v1.0.10

### Removed
- **"All" view** — Removed the multi-panel "All" view and `a` keyboard shortcut; default view is now Thinking. Every view is now single-panel, simplifying the view system by removing `showAll` branching, `view-all` CSS class, and mobile-specific multi-panel rules. Timeline already provides a unified chronological feed.
- **Two-agent workflow** — Removed `code-implementer` and `code-test-evaluator` agents; replaced with model selection guidance (Haiku for mechanical tasks, Sonnet for moderate, Opus for complex)

---

## 2026-02-07 — v1.0.9

### Changed
- **Timeline tool summaries** — Timeline tool_start entries now use `summarizeInput` for human-readable previews (e.g. `computer started: screenshot` instead of raw JSON), consistent with the tools panel

---

## 2026-02-07 — v1.0.8

### Changed
- **Smart tool input previews** — MCP browser tools (`computer`, `navigate`, `find`, `form_input`) now show human-readable previews (e.g. `screenshot`, `left_click (33,67)`, `key "o"`) instead of raw JSON; unknown tools show compact `key:value` summaries; added 10 new tests (1034 total)

---

## 2026-02-07 — v1.0.7

### Added
- **Search keyboard navigation** — Arrow keys (Up/Down) navigate through Cmd+K search results with a visual active highlight; Enter activates the selected result, matching standard command palette behavior

### Changed
- **Timeline type badge labels** — Replaced auto-generated labels with concise display names (e.g. "HOOK" instead of truncated "HOOK EXECUTI...", "SESSION" instead of "SESSION START"); full event type available via tooltip on hover

---

## 2026-02-07 — v1.0.6

### Added
- **Search result highlighting** — Matching text in Cmd+K search results is now highlighted with a blue background using `<mark>` tags, making it easier to spot relevant matches at a glance

---

## 2026-02-07 — v1.0.5

### Changed
- **Shortened MCP tool names** — Tool names like `mcp__claude-in-chrome__computer` now display as `computer` across the stats bar, tools panel, hooks panel, and timeline; full names available via tooltip on hover

---

## 2026-02-07 — v1.0.4

### Added
- **Keyboard shortcut help** — Press `?` to open a modal showing all available keyboard shortcuts, organized into Navigation, Panels, Actions, and Commands groups with styled key indicators

### Fixed
- **Connection overlay theme adaptation** — Reconnection overlay now uses theme-aware `--color-surface-overlay` instead of hardcoded dark background, working correctly on light and solarized themes
- **Retry button hover color** — Replaced hardcoded `#4c96eb` with `filter: brightness()` for theme-independent hover state

---

## 2026-02-07 — v1.0.3

### Changed
- **Debug logging system** — Replaced 47 `console.log` calls across 12 dashboard modules with conditional `debug()` logger; silent by default, enable via `localStorage.setItem('debug', 'true')` in DevTools
- **Export modal focus trap** — Added focus trapping, focus restoration, and keyboard handling to the export modal (matching panel selector and search overlay)

---

## 2026-02-07 — v1.0.2

### Fixed
- **Modal focus trapping** — Panel visibility modal and search overlay (Cmd+K) now trap Tab/Shift+Tab focus within the dialog, preventing keyboard navigation from escaping behind the overlay
- **Modal focus restoration** — Closing either modal restores focus to the element that triggered it, improving keyboard workflow
- **Search overlay ARIA** — Added `role="dialog"`, `aria-modal`, and `aria-label` attributes to the search overlay for screen reader compatibility
- **Console.log cleanup** — Removed debug logging from panel selector module

---

## 2026-02-07 — v1.0.1

### Fixed
- **Timeline chip toggle** — Toggling type filter chips off and back on now correctly re-shows matching entries; count badge shows `visible/total` when any filter is active
- **Plan panel empty icon** — Replaced literal "file" text with document emoji, matching the empty-states pattern used elsewhere
- **Hooks filter empty state** — Hooks panel now shows "No matching hook events" when a filter yields zero results instead of appearing blank

---

## 2026-02-07 — v1.0.0

### Added
- **Platform support documentation** — README now includes compatibility matrix (macOS, Linux fully supported; Windows partial via WSL/Git Bash)

### Changed
- **First public release** — Repository visibility set to public on GitHub

---

## 2026-02-07 — v0.24.0

### Added
- **MIT License** — Open source under MIT license with proper attribution
- **Stats bar tooltips** — Descriptive hover tooltips on each stat cell explaining what the metric means (top tools, avg/P95, thinking, hooks, rate)
- **Mock data script** — `scripts/mock-data.sh` populates all dashboard panels with realistic sample events for demos and screenshots
- **SECURITY.md** — Standard vulnerability disclosure policy
- **CONTRIBUTING.md** — Development setup, testing, and PR workflow guide
- **README revamp** — New badges (MIT, PRs Welcome, GitHub Stars), How It Works explanation, Disclaimer, Contributing, and License sections

### Security
- **ReDoS mitigation** — Tightened password redaction pattern quantifier from `{8,80}` to `{8,40}`
- **CSS injection prevention** — Applied `escapeCssValue()` to `session.color` in active session indicator
- **Unbounded Map cap** — Added `MAX_PENDING_TOOLS = 10,000` limit on tool start time tracking with oldest-entry eviction
- **Buffer size pre-check** — WebSocket message size validated on raw buffer before string conversion to prevent memory spikes
- **X-Content-Type-Options** — Added `nosniff` header to all HTTP responses
- **Loopback verification** — Origin-less WebSocket connections now verify `remoteAddress` is loopback
- **Symlink resolution** — Export handler resolves parent directory symlinks before path validation
- **Simplified path validation** — Removed redundant `..` check after `resolve()` in plan watcher

### Removed
- **PII scrubbed** — All hardcoded `/Users/true/` paths replaced with generic or relative paths
- **Sensitive files** — Removed SecurityReport, REFACTOR-PLAN, and TEST_EVALUATION_REPORT from tracked files

### Changed
- **package.json** — Added author, MIT license, repository, homepage, and bugs fields

---

## 2026-02-07 — v0.23.0

### Added
- **Tool Duration Histogram** — compact 6-bar chart in Tools panel header showing duration distribution (<100ms to 15s+) with color-coded buckets and hover tooltips
- **Timeline Type Filter Chips** — clickable category chips (Thinking, Tools, Hooks, Agents, Team, Plans) above timeline entries with count badges, toggle visibility, and localStorage persistence
- **Session Stats Bar** — always-visible metrics row between main content and footer showing top 5 tools by call count, avg/P95 duration, thinking block count, hook allow/deny/ask ratio, and events/min rate
- **Global Search (Cmd+K)** — cross-panel search overlay with debounced input, grouped results by panel (Thinking, Tools, Hooks, Timeline), click-to-navigate with highlight animation
- **Enhanced Empty States** — context-aware empty states with descriptive guidance text and keyboard shortcut hints (e.g., plan panel shows Cmd+O/Cmd+Shift+R)

---

## 2026-02-07 — v0.22.4

### Added
- **Dispatcher tests** — 95 static analysis tests validating event routing for all 17 event types, handler imports, session tracking, timeline integration, and exhaustive switch coverage

---

## 2026-02-07 — v0.22.3

### Added
- **Team watcher tests** — 32 tests covering config parsing, task monitoring, secret redaction, error handling, lifecycle, and event emission
- **Formatting utility tests** — 136 tests for duration, byte, timestamp, and elapsed-time formatting
- **Logger tests** — 27 tests for log level filtering, formatting, and output

### Security
- **Event ID validation** — rejects session/agent/tool IDs longer than 256 chars or with unexpected characters, preventing unbounded memory usage
- **CSS escape allowlist** — `escapeCssValue()` switched from blacklist to allowlist approach, only permitting known-safe characters

---

## 2026-02-07 — v0.22.2

### Added
- **Timeline filter input** — search/filter timeline entries by event type, summary, or agent name with filtered/total count badge

### Fixed
- **Reveal in Finder endpoint** — corrected test assertion documenting a false endpoint mismatch bug (client already used `/file-action` correctly)

---

## 2026-02-07 — v0.22.1

### Added
- **Session duration in status bar** — shows elapsed time (e.g., "2h 15m") next to active session name in footer, updates every 60s
- **WebSocket ping/pong heartbeat** — 30s ping interval detects and terminates stale connections, preventing memory leaks
- **Enhanced health endpoint** — `/health` now returns uptime, events_received, and events_by_type breakdown

### Changed
- **Tool duration color coding** — four-tier system: green (<1s), yellow (1-5s), orange (5-15s), red (>15s) for better visual feedback on slow tools

### Security
- **Tightened Bearer token regex** — reduced upper bound from 256 to 128 chars, matching real-world token lengths and reducing ReDoS surface

---

## 2026-02-07 — v0.22.0

### Added
- **Unified Timeline View** — chronological feed across all event types (thinking, tools, hooks, team, tasks) with type-specific icons, colored borders, and agent badges; `l` keyboard shortcut
- **Hook PRE+POST Grouping** — PreToolUse and PostToolUse hook entries merge into a single "Pre→Post" entry when they share a toolCallId, reducing noise in the Hooks panel
- **Session Dropdown** — compact `<select>` replacing badge-based session filter with status indicators (● active, ○ idle, ◌ inactive) and per-agent filter chips
- **Tab Count Badges** — live event counts displayed on all view tabs (thinking, tools, hooks, team, tasks)
- **Cross-Panel Linking** — click hook tool names to jump to matching tool entry; click team member cards and task owner badges to filter by agent
- **Agent Tree inline in Team panel** — auto-shows nested agent hierarchy between member grid and messages when agents are active

### Changed
- Hook shell script now passes `toolCallId` as 5th parameter for PRE/POST matching
- `HookExecutionEvent` type extended with optional `toolCallId` field
- Timeline panel added to panel selector, persistence, and keyboard shortcuts
- View tabs now include Timeline (`l`) with Shift+L to collapse

---

## 2026-02-06 — v0.20.0

### Added
- **Team Dashboard panel** — visualizes Claude Code agent teams with member grid (active/idle/shutdown status indicators), inter-agent message timeline with sender/recipient badges, and broadcast/shutdown styling
- **Task Board panel** — three-column kanban (Pending | In Progress | Completed) with task cards showing subject, owner badge, blocked-by indicators, and auto-updates on task events
- **Agent tree rendering** — nested agent hierarchy visualization with recursive tree lines, status dots (running/success/failure), click-to-filter by agent
- **Per-agent event filtering** — click any agent in the tree to filter thinking, tools, and hooks panels to only that agent's events
- **SendMessage detection** — parses SendMessage tool calls from tool_start events to populate team message timeline (same pattern as TodoWrite detection)
- **Enhanced hook filters** — new TeammateIdle, TaskCompleted, and Team Events filter options in hooks panel dropdown
- **Hook execution metadata** — async badge and hookExecType indicator (command/agent/prompt) displayed on hook entries
- **Keyboard shortcuts** — `m` for Team view, `k` for Tasks view, Shift+M/K to collapse
- 5 event types now fully handled in dashboard: team_update, task_update, message_sent, teammate_idle, task_completed

### Changed
- View tab navigation extended with Team and Tasks tabs
- Panel selector modal includes Team and Tasks visibility toggles
- Agent tree populated from parentAgentId in subagent_mapping events (agentChildren Map)
- Mobile responsive CSS for team member grid and task board columns

---

## 2026-02-06

### Changed
- **CLAUDE.md architecture documentation refresh**
  - Removed exhaustive file-by-file component tables (easily discoverable in source)
  - Added "Three Codebases in One Repo" section explaining dual esbuild build targets (server, dashboard, shared)
  - Added "Dashboard Architecture" section documenting init*() dependency injection pattern and state management
  - Added "Hook System" section explaining full pipeline from ~/.claude/settings.json → HTTP → EventProcessor → WebSocketHub → Dashboard
  - Expanded "Security Requirements" with CSP headers and CORS origin validation details
  - Clarified versioning workflow (bump script updates package.json, src/server/types.ts, CHANGELOG.md)
  - Added "Testing" section documenting co-located test convention (*.test.ts)

---

## [0.18.7] - 2026-01-12

### Security
- **esbuild upgraded to 0.27.2** - Fixes GHSA-67mh-4wv8-2f99 (CORS vulnerability in dev server)

---

## [0.18.6] - 2026-01-12

### Security
- **WebSocket message validation** - Early JSON validation before processing; connection closes with code 1009 on oversized messages, code 1003 after 6+ invalid JSON messages; mitigates CWE-20

### Added
- 11 new WebSocket security tests covering size limits, JSON validation, and per-client rate limiting

---

## [0.18.5] - 2026-01-12

### Security
- **ReDoS protection in secret redaction** - Tightened regex quantifier bounds from `{16,256}` to `{16,80}` and added upper bounds to unbounded patterns; mitigates CWE-1333 backtracking attacks

### Added
- 16 new tests for ReDoS protection including performance benchmarks and boundary behavior

---

## [0.18.4] - 2026-01-12

### Security
- **XSS table CSS injection defense** - Table alignment values now sanitized with `escapeCssValue()` before insertion into style attributes; defense-in-depth against CWE-79

### Added
- 45 new security tests for html.ts (26 tests) and markdown.ts (19 tests) covering CSS injection prevention

---

## [0.18.3] - 2026-01-12

### Security
- **CORS origin validation bypass fixed** - Invalid origins now rejected with 403 BEFORE any CORS headers are set; fixes CWE-942 vulnerability in file-actions.ts and export-handler.ts

### Added
- 18 new CORS security tests covering all endpoint handlers (handleFileActionRequest, handleExportRequest, handleBrowseRequest, handleRevealFileRequest)

---

## [0.18.2] - 2026-01-11

### Fixed
- **SUBAGENTSTOP agent name display** - SUBAGENTSTOP hook events now show the agent name badge (e.g., "gemini-researcher") matching SUBAGENTSTART; looks up agent name from subagentState before falling back to output parsing

### Added
- **Subagent state lookup for hook events** - hooks.ts now imports subagentState to resolve agent names from tracked agent_start events

### Changed
- **Improved CLAUDE.md** - Rewrote project instructions with Commands section, Architecture overview (data flow diagram, component tables), and condensed versioning workflow

---

## [0.18.1] - 2026-01-11

### Fixed
- **Badge contrast implementation** - Fixed badge color usage in tools.ts, thinking.ts, and hooks.ts to consistently use `getAgentBadgeColors()` function instead of mixing with hardcoded text colors, ensuring WCAG AA compliance across all agent badge types

---

## [0.18.0] - 2026-01-11

### Added
- **WCAG AA compliant badge colors** - Agent type badges (Explore, Plan, etc.) now have theme-aware colors with proper contrast ratios for readability across all themes
- **Theme-specific badge styling** - Dark themes use solid backgrounds with white text; light themes use pastel backgrounds with dark text
- **Badge color API** - New `getAgentBadgeColors()` function in colors.ts returns bg/text pairs for any agent

### Changed
- **Improved light theme readability** - Badge contrast ratio improved from ~2.7:1 to 5.5:1+ (WCAG AA compliant)
- **Extended theme system** - Added 16 new badge color CSS variables per theme (bg + text for 8 color types)

---

## [0.17.4] - 2026-01-11

### Fixed
- **TypeScript strict mode type checking** - Fixed ~100+ type checking errors across the codebase
- **Module resolution** - Added .ts extensions to all relative imports for NodeNext module resolution compatibility
- **Index signature in MonitorEventBase** - Added index signature to allow external hooks to pass additional properties
- **Unused declarations** - Removed unused imports and declarations in dispatcher.ts, event-receiver.ts, websocket-hub.ts, thinking.ts, tools.ts, and agents.ts
- **Type incompatibilities** - Fixed type assertion issues and incompatible Promise handling patterns throughout handlers

---

## [0.17.3] - 2026-01-11

### Changed
- **Folder names as primary identifiers** - Sessions now display project folder names (e.g., `thinking`) instead of session IDs (e.g., `5026645a`) throughout the UI
- **Cleaner panel entries** - Thinking, Tool Activity, and Hooks panels show folder badge only; session ID moved to tooltip
- **Status bar clarity** - Shows folder name as primary identifier; full path and session ID available on hover
- **Improved session tooltips** - Folder name shown prominently at top, path below, session ID as secondary info

---

## [0.17.2] - 2026-01-11

### Added
- **Auto-scroll tooltip** - Hover shows "Automatically scroll to latest content when new events arrive"
- **Theme cycling icon** - Single icon button replaces dropdown; click cycles through System/Dark/Light/Solarized themes
- **Export icon button** - Download arrow icon (↓) replaces "Export" text button
- **Clear icon in sessions row** - Compact clear button (✕) moved left of "All" in SESSIONS filter bar

### Changed
- **Gear icon relocated** - Panel settings gear moved from header to view tabs row (right-aligned)
- **Streamlined header** - Flexbox spacer pushes theme toggle to right; cleaner control layout

### Fixed
- **Cross-session agent attribution** - Fixed bug where thinking/tool entries from one session were incorrectly attributed to another session's subagents; now validates agent context belongs to current session before using it

---

## [0.17.1] - 2026-01-11

### Fixed
- **Status bar clears on panel clear** - Pressing 'c' to clear now also resets the status bar session indicator (was still showing last session)

---

## [0.17.0] - 2026-01-11

### Added
- **Subagent thinking display** - When Claude spawns subagents (code-implementer, haiku-general-agent, etc.), their thinking is now shown in the dashboard
- **Subagent session nesting** - Session filter shows subagents nested under their parent sessions with tree-line indicators
- **Subagent count indicator** - Sessions with active subagents show a purple badge with the subagent count
- **Subagent thinking badges** - Thinking entries from subagents display a purple badge with the agent name
- **Parent session filtering** - Selecting a session automatically includes thinking from its subagents
- **Server-side subagent mapping** - SubagentMapper tracks parent-child relationships with 5-minute cleanup grace period

---

## [0.16.9] - 2026-01-11

### Added
- **Hooks session filtering** - Hooks panel now filters by selected session (previously showed all sessions)
- **Hooks folder/session badges** - Hook entries now show folder badge and session ID badge for context
- **Hooks agent badge** - Subagent hooks show agent ID badge when running in a subagent
- **Right-aligned decision badges** - ALLOW/OBSERVED/DENY badges now right-aligned for cleaner layout

### Changed
- **Cleaner hook entries** - Removed redundant "thinking-monitor-hook" text, entries now show badges only
- **SubagentStart/Stop display** - Agent type now shown in tool position; SubagentStop skips badge when only ID available

---

## [0.16.8] - 2026-01-11

### Added
- **Export content selection** - Checkboxes to choose what to include in export: thinking blocks, tool calls, todos, hooks

### Changed
- **Local time in exports** - Session start/end times and export date now display in local time (e.g., "Jan 11, 2026, 07:45:30 AM") instead of UTC ISO format

---

## [0.16.7] - 2026-01-11

### Added
- **Folder badges in thinking/tool entries** - When sessions are in the same folder, entries now show a folder badge (same color for same folder) plus session ID badge (unique color per session)
- **Multi-session distinction** - Session ID badges now have unique colors based on session ID hash, making it easier to distinguish between sessions in the same folder

### Changed
- **Status bar format** - Now shows `folderName-shortId` (e.g., "thinking-abc123de") instead of just folder name

---

## [0.16.6] - 2026-01-10

### Changed
- **Reveal in Finder instead of open** - After export, reveals the file in Finder (selected) instead of opening in markdown viewer

---

## [0.16.5] - 2026-01-10

### Added
- **Auto-open exported file** - After saving, the markdown file automatically opens in the system's default markdown viewer (replaced by reveal in v0.16.6)

---

## [0.16.4] - 2026-01-10

### Changed
- **Export requires session** - Export button disabled when "All" sessions selected; must select a specific session to export
- **Keyboard shortcut guard** - `Cmd+E` shows toast "Select a session to export" when All is selected

---

## [0.16.3] - 2026-01-10

### Added
- **File browser in export modal** - Navigate directories, click folders to enter, click ".." to go up, click existing .md files to select
- **Filename input** - Just type the filename, directory comes from the browser

### Changed
- **Export anywhere** - Removed directory restrictions; can now save .md files to any location you have write access to
- **Smarter defaults** - Export modal opens to session's working directory with suggested filename based on session ID

---

## [0.16.2] - 2026-01-10

### Added
- **Export as Markdown** - New export button in header (or `Cmd+E`) opens a modal to save the current session as a formatted markdown file
- **Export modal** - Shows session stats (thinking blocks, tools, todos) and allows specifying the save path

---

## [0.16.1] - 2026-01-10

### Fixed
- **Session bar infinite expansion** - Fixed bug where all 1400+ historical transcript files were tracked as sessions on startup, causing the session bar to overflow with badges
- **Reveal in Finder not working** - Fixed Content Security Policy to allow HTTP requests to the API port (was only allowing WebSocket)
- **Reveal in Finder wrong port** - Fixed fetch URL to use correct API port (3355) instead of relative URL
- **CORS for file actions** - Dynamic CORS headers now match the request origin for both `localhost` and `127.0.0.1` variants
- **Tooltip TypeError** - Fixed `target.closest is not a function` error when hovering over text nodes in session badges

### Changed
- Sessions are now only tracked when new activity occurs (not from historical transcript files)

---

## [0.16.0] - 2026-01-10

### Added
- **Folder-based session names** - Session badges now display folder names (e.g., `thinking`) instead of session IDs for better readability
- **Session grouping by folder** - Sessions from the same folder share colors and are sorted together in the filter bar
- **Custom session tooltips** - Hover over session badges to see full session ID and working directory path
- **Session context menu** - Right-click session badges to "Reveal in Finder" (opens the session's working directory)
- **Activity-based pulsing** - Session dots only pulse when there's activity within the last 10 seconds, then stop
- **Status bar session indicator** - Footer shows the most recently active session; click to select it
- **getSessionColorByFolder()** - New color utility that hashes folder names for consistent visual grouping

### Changed
- Session filter bar now sorts sessions alphabetically by folder name
- Online sessions without recent activity show a static glow instead of pulsing animation

---

## [0.15.7] - 2026-01-10

### Changed
- **Hooks panel enabled by default** - New users now see the Hooks panel by default in Panel Visibility settings

---

## [0.15.6] - 2026-01-10

### Changed
- **thinking-monitor-hook.sh** - Added fast TCP health check (~10ms vs ~1s timeout); skips hook execution if server isn't running

### Removed
- **Playwright MCP artifacts** - Deleted `.playwright-mcp/` directory (55 screenshots, ~12MB) after MCP removal
- **Accidental npm cache** - Removed `~/.npm/` directory that was mistakenly created and tracked inside repo

---

## [0.15.5] - 2026-01-08

### Changed
- **View tab order** - Reordered to: All → Thinking → Tools → Hooks → Plan → Todo
- **Session-aware tabs** - Todo and Plan tabs hidden when "All sessions" selected (these panels are session-specific)

### Fixed
- **Panel collapse in single view** - Collapse toggle now hidden when viewing a single panel (collapse only makes sense in "All" view)

---

## [0.15.4] - 2026-01-07

### Fixed
- **Hooks panel now working** - Added `'hook_execution'` to server event validation (was silently rejecting all hook events)
- **Hooks visible in All view** - Hooks panel now appears alongside Thinking and Tool Activity in the All view

### Changed
- Extended `HookType` to include all Claude Code hook types (SubagentStart, SubagentStop, SessionStart, SessionStop)
- Hook script now sends `hook_execution` events to track when hooks run
- Added cache-busting query parameter to app.js

---

## [0.15.3] - 2026-01-07

### Changed
- **Modular CSS architecture** - Split monolithic `styles.css` (3,121 lines) into 13 focused modules in `src/dashboard/css/`:
  - `variables.css` - CSS custom properties
  - `reset.css` - Browser reset
  - `animations.css` - Keyframes and transitions
  - `layout.css` - App structure
  - `components.css` - Buttons, badges
  - `panels.css` - Panel containers
  - `content.css` - Entries, agent tree
  - `todos.css` - TODO panel
  - `hooks.css` - Hooks panel
  - `markdown.css` - Plan markdown
  - `modals.css` - Dialogs, menus
  - `accessibility.css` - Focus states
  - `main.css` - Import hub
- Added server ports documentation to CLAUDE.md

---

## [0.15.2] - 2026-01-07

### Fixed
- **Solarized theme contrast improvements** - Solarized Light now uses darker text colors (base02/base01/base00) for better readability; Solarized Dark now uses lighter text colors (base2/base1/base0) for better contrast against dark backgrounds

---

## [0.15.1] - 2026-01-07

### Changed
- **"All" view now shows only Thinking and Tool Activity** - Todo, Hooks, and Plan panels require explicit tab selection
- View filter now properly manages `panel-hidden` class to work with Panel Selector

### Fixed
- Panel visibility now respects both Panel Selector settings AND view tab selection

---

## [0.15.0] - 2026-01-07

### Added
- **HOOKS panel** - New panel to track hook executions (PreToolUse, PostToolUse, Stop, UserPromptSubmit)
- **Hooks view tab** - Added "Hooks" to the view tab bar for filtering to hooks-only view
- **Keyboard shortcut H** - Press `h` to switch to Hooks view, `Shift+H` to collapse/expand panel
- **HookExecutionEvent type** - Server-side event type for hook tracking
- Color-coded decision badges (green=allow, red=deny, yellow=ask)
- Hook type badges with distinct colors per hook type

---

## [0.14.0] - 2026-01-07

### Added
- Panel Selector modal for showing/hiding dashboard panels
- Gear icon (⚙) button in header to open panel settings
- Shift+P keyboard shortcut to toggle panel selector
- localStorage persistence for panel visibility preferences
- `PanelVisibility` interface and state management
- `.panel-hidden` CSS class for completely hiding panels

---

## [0.13.0] - 2026-01-07

### Added
- **Tool duration badges** - Each tool call now displays elapsed time in milliseconds
- **Color-coded duration indicators** - Badges show green for <500ms, yellow for 500ms-2s, red for >2s
- **Server-side duration calculation** - Duration computed from tool_start to tool_end timestamps

### Changed
- **Hook script timing extraction** - Now correctly extracts tool_use_id from Claude Code events for accurate tool tracking
- **EventReceiver tool timing** - Tracks tool timestamps for accurate duration measurement

---

## [0.12.1] - 2026-01-07

### Fixed
- **Tool Activity pane legibility** - Tool input now renders with markdown formatting (line breaks, code blocks) instead of raw escaped text. Escape sequences (`\n`, `\t`, `\"`) are properly converted to actual characters. Removed height limits so content expands to fit

---

## [0.12.0] - 2026-01-05

### Changed
- **Single-column vertical layout** - Major UI refactor from 2-column grid to vertically stacked panels for better usability
- **Updated screenshot** - New dashboard screenshot reflecting the v0.12.0 layout

### Added
- **Resizable panels** - Drag resizers between panels to adjust heights
- **Dynamic resizer rebuilding** - Resizers automatically rebuild when panels collapse/expand or sessions change
- **Session-aware panel visibility** - TODO and PLAN panels auto-hide in "All" sessions view
- **Drag-to-reorder collapsed panels** - Reorder collapsed panels by dragging
- **GFM markdown tables** - GitHub-flavored table rendering with alignment support

### Security
- **XSS via markdown links** (CRITICAL-001) - Fixed attribute breakout in rendered links
- **ReDoS protection** (HIGH-001) - Added 50KB content cap before regex processing
- **CSS injection defense** (CRITICAL-002) - Sanitized dynamic color values

---

## [0.11.8] - 2026-01-05

### Changed
- **Single-column vertical layout** - Replaced 2-column grid with vertically stacked panels for better usability
- **Dynamic resizer rebuilding** - Resizers now rebuild automatically when panels collapse/expand or sessions change, fixing issues where resizing didn't work in certain states

### Added
- **Session-specific panel hiding** - TODO and PLAN panels automatically hide when "All" sessions is selected (they're session-specific and not useful in aggregated view)
- **Drag-to-reorder collapsed panels** - Collapsed panels can now be dragged to reorder their position in the layout

---

## [0.11.7] - 2026-01-05

### Added
- **GFM table support in markdown** - Plan panel now renders GitHub-flavored markdown tables with alignment (`:---`, `:---:`, `---:`)

### Fixed
- **Excessive spacing in rendered markdown** - Collapsed multiple blank lines and removed unnecessary `<br>` tags around block elements (headers, tables, hr, blockquotes, code blocks)

---

## [0.11.6] - 2026-01-04

### Security
- **CRITICAL-002: CSS injection defense in style attributes** - Added `escapeCssValue()` function to sanitize dynamic color values in agent and session badge styling (defense in depth)

---

## [0.11.5] - 2026-01-04

### Security
- **HIGH-001: ReDoS protection in secret redaction** - Added 50KB content length cap before regex processing to prevent O(n²) backtracking attacks that could freeze the server

---

## [0.11.4] - 2026-01-04

### Security
- **CRITICAL-001: XSS via markdown links fixed** - Added `encodeHtmlAttribute()` function that properly escapes quotes in HTML attribute values, preventing attribute breakout attacks in rendered markdown links

---

## [0.11.3] - 2025-12-31

### Changed
- **Payload size limit increased**: MAX_PAYLOAD_SIZE raised from 10KB to 100KB for content truncation
- **Large request handling**: Server now accepts large requests and truncates content fields, instead of rejecting immediately

### Security
- **Memory exhaustion protection**: Added 5MB hard streaming limit to prevent DoS from extremely large requests
- **Two-tier payload approach**: 5MB streaming limit (reject) + 100KB content truncation (accept and trim)

### Added
- EventReceiver unit tests (8 new tests covering body size limits and content truncation)

---

## [0.11.2] - 2025-12-31

### Changed
- **Session close button**: Moved inside badge, appears on hover only (clearer association)
- **Session indicator removed**: Eliminated redundant session display from header

### Fixed
- Close button positioning ambiguity in session filter bar

---

## [0.11.1] - 2025-12-29

### Security
- **Content-Security-Policy header**: Defense-in-depth XSS protection for dashboard
  - Scripts only from 'self' (no inline scripts)
  - Styles allow 'unsafe-inline' for dynamic theming
  - WebSocket connections restricted to localhost ports
- **WebSocket message size limit**: 100KB max to prevent DoS via oversized messages
- **CSRF protection on file actions**: Origin header validation blocks cross-origin requests
- **ReDoS prevention**: Added max quantifiers to regex patterns in secret detection

---

## [0.11.0] - 2025-12-29

### Added
- **Theme system**: Five themes with system preference tracking and persistence
  - Dark (default), Light, Solarized, Solarized Dark themes
  - "System" option follows OS dark/light preference automatically
  - Theme persists across sessions via localStorage
- Theme dropdown selector in dashboard header
- Color cache reset for dynamic theme switching

### Technical
- `src/dashboard/themes.ts` - Theme definitions and application logic
- `src/dashboard/ui/theme-toggle.ts` - Theme selector UI component
- `src/dashboard/themes.test.ts` - 33 unit tests for theme system

---

## [0.10.0] - 2025-12-29

### Changed
- **Type-safe event handling**: Dashboard handlers now use discriminated union types (`StrictMonitorEvent`)
- Dashboard switch statements auto-narrow event types (no more `String()` coercions or `as Type` casts)
- Consolidated event type definitions: 11 specific event interfaces in `src/shared/types.ts`
- Server types now import from shared module (eliminates ~100 lines of duplicate definitions)

### Technical
- Added `MonitorEventBase` interface (without index signature) for strict typing
- Added specific event interfaces: `ToolStartEvent`, `ToolEndEvent`, `ThinkingEvent`, `AgentStartEvent`, `AgentStopEvent`, `SessionStartEvent`, `SessionStopEvent`, `PlanUpdateEvent`, `PlanDeleteEvent`, `PlanListEvent`, `ConnectionStatusEvent`
- `StrictMonitorEvent` discriminated union enables exhaustive type checking in switch statements
- Kept `MonitorEvent` (with index signature) for backward compatibility with external hooks

---

## [0.9.1] - 2025-12-29

### Fixed
- Remove redundant hardcoded origins in WebSocket hub (use CONFIG.STATIC_PORT consistently)
- Use CONFIG-based CORS origin in file-actions endpoint instead of hardcoded port
- Add error boundaries to async callbacks in setTimeout/setInterval (plan-watcher, transcript-watcher)
- Remove unused TypeScript imports (ViewType, PanelName) in dashboard keyboard handler

---

## [0.9.0] - 2025-12-29

### Added
- **Log levels**: `LOG_LEVEL` env var (debug/info/warn/error) for controlling server output verbosity
- **Shared types module**: `src/shared/types.ts` eliminates type drift between server and dashboard
- **Cross-platform file actions**: Support for Windows (`explorer`) and Linux (`xdg-open`) in addition to macOS

### Changed
- **Transcript watcher optimization**: Uses byte-offset streaming reads instead of re-reading entire files on each poll (memory efficient for large transcripts)

### Security
- **Shell injection fix**: Replaced `exec` with `spawn` in file-actions.ts (eliminates shell injection vulnerability)
- **Safe logging**: Invalid events no longer log raw parsed objects that could contain secrets (logs only type and key names)

---

## [0.8.0] - 2025-12-29

### Changed
- **Major refactoring**: Extracted monolithic app.ts (3,247 lines) into 16 focused modules (497 lines remaining)
- Created `handlers/` directory with 7 event handler modules:
  - `dispatcher.ts` - Event routing and connection status
  - `thinking.ts` - Thinking block display
  - `tools.ts` - Tool start/end handling
  - `agents.ts` - Agent context stack management
  - `sessions.ts` - Session tracking and filtering
  - `plans.ts` - Plan display, selection, context menus
  - `todos.ts` - Todo panel rendering and state
- Adopted callback pattern across handlers to avoid circular imports
- All handlers now use explicit initialization functions for dependency injection
- Bundle size increased slightly (74kb → 76kb) due to module overhead

### Technical
- 85% reduction in app.ts code (2,750 lines moved to handlers)
- Improved separation of concerns with single-responsibility modules
- Better testability through dependency injection pattern
- Preserved all existing functionality with zero behavioral changes

---

## [0.7.0] - 2025-12-29

### Added
- Collapsible panels: each of the 4 dashboard panels (Thinking, Todo, Tools, Plan) can now be collapsed
- Collapse buttons with chevron icons in panel headers
- Keyboard shortcuts: Shift+T (Thinking), Shift+O (Tools), Shift+D (Todo), Shift+P (Plan) to toggle collapse
- localStorage persistence for collapse state (survives page refresh)
- Accessibility: ARIA attributes (aria-expanded, aria-label), screen reader announcements on collapse/expand
- Mobile-optimized: 44px touch-friendly collapse button targets

### Changed
- Sibling panel expands to fill space when adjacent panel is collapsed (flexbox-based layout)
- Updated footer keyboard hints to show collapse shortcuts

---

## [0.6.2] - 2025-12-28

### Added
- Responsive design with 4 breakpoints: desktop (>1200px), tablet (768-1200px), mobile (480-768px), small mobile (<480px)
- Accessibility enhancements: skip link to main content, live region announcer for status updates, ARIA landmarks (navigation, main, region roles)
- Focus management: focusActivePanel() function for keyboard navigation, enhanced focus indicators with WCAG AAA contrast
- Screen reader support: screen-reader-only class for semantic content, keyboard-accessible panel switching (a/t/o/d/p keys)
- Touch-friendly targets: minimum 44px hit targets for buttons and interactive elements across all screen sizes
- Color contrast improvements: WCAG AA minimum 4.5:1 contrast ratio for all text, enhanced indicators for selected/focused states
- Responsive typography: fluid font scaling based on viewport width (rem units with clamp())
- Mobile-optimized layout: stacked panels on small screens, adjusted spacing and padding for touch interactions

### Changed
- CSS restructured with mobile-first approach: base styles for mobile, media queries for larger screens
- Panel headers adjusted for mobile: reduced padding, optimized for touch in vertical orientation
- Entry cards: responsive padding and spacing that scales with viewport

---

## [0.6.1] - 2025-12-28

### Added
- Panel headers with glassmorphism design (blur backdrop filter, elevated shadows)
- Thinking/Tool entries card-based redesign with improved spacing and subtle borders
- TODO progress bar showing completion percentage with visual feedback
- Enhanced markdown rendering in Plan panel: support for lists, checkboxes, blockquotes, and horizontal rules
- Improved visual hierarchy throughout dashboard with refined typography and spacing

---

## [0.6.0] - 2025-12-28

### Added
- Design system foundation with CSS tokens for typography (scale, weights), spacing (8px grid), shadows (2-4 levels), and color surfaces
- Motion design tokens for smooth animations (ease functions, timing durations) and reduced motion support
- Toast notification system for user feedback (success, error, info types with auto-dismiss)
- Skeleton loading states for better perceived performance
- Empty state designs with emoji icons and structured title/subtitle layout
- Micro-interactions including button hover/active states and smooth transitions
- Entry animations with staggered sequences for panels and content
- Improved accessibility with `prefers-reduced-motion` support throughout

### Changed
- Updated empty state messages in HTML to use structured layout with icons
- Refactored app.ts to centralize empty state and notification rendering

---

## [0.5.3] - 2025-12-28

### Added
- localStorage persistence for session-plan associations (survives page refresh)
- Automatic cleanup: entries older than 7 days are pruned
- Storage limit: maximum 100 associations kept (oldest removed first)

---

## [0.5.2] - 2025-12-28

### Fixed
- Plan content now loads when selecting a session with an associated plan (was stuck on "Loading...")
- `displayPlan()` now requests content from server when not cached

---

## [0.5.1] - 2025-12-28

### Added
- Read tracking for plan file associations: sessions using `--plan` now associate when reading plan files
- Hash-based session colors: each session ID gets a consistent unique color

### Fixed
- Plan panel no longer shows plans when "All" sessions is selected (plans are session-specific)
- Plan content now loads correctly when selected from dropdown
- Session colors are now distinct (previously could show same color for different sessions)

---

## [0.5.0] - 2025-12-28

### Security
- XSS protection: markdown renderer now validates URL protocols (blocks javascript:, data:, vbscript:)
- File actions endpoint restricted to `~/.claude/` directory only (was allowing any absolute path)
- Rate limiting: /event endpoint now limited to 100 requests/second per IP (prevents DoS)
- Hook script input limited to 1MB to prevent memory issues with malformed inputs

### Added
- Configurable polling interval via `THINKING_POLL_INTERVAL` env var (100-10000ms, default 1000ms)
- Rate limiter module with sliding window algorithm (`src/server/rate-limiter.ts`)
- File actions test suite (`src/server/file-actions.test.ts`)

### Fixed
- Agent context stack memory leak: now limited to 100 entries with 1-hour stale cleanup
- CSS colors consolidated into CSS variables for easier theming

---

## [0.4.7] - 2025-12-28

### Fixed
- Memory leak: `sessionPlanMap` now cleared in `clearAllPanels()` to prevent unbounded growth
- Test suite: Updated test assertions to match refactored code patterns (all 416 tests pass)

---

## [0.4.6] - 2025-12-28

### Fixed
- Session-plan associations now work reliably via Write/Edit tool events only
- Removed flaky plan_update fallback that caused incorrect associations on page load

---

## [0.4.5] - 2025-12-28

### Fixed
- Plan association now works via `plan_update` events, not just Write/Edit tool events
- Plans are now correctly associated with the active session when the plan file is modified

---

## [0.4.4] - 2025-12-28

### Added
- Session-plan associations: when a session writes to a plan file, that plan is automatically associated with the session
- When filtering by session, the Plan panel shows that session's associated plan instead of the most recent plan
- New "No plan for session" message with hint to browse all plans via dropdown

### Changed
- Plan panel now tracks which sessions use which plans via `sessionPlanMap`
- When "All" sessions is selected, shows most recently modified plan
- When a specific session is selected, shows that session's associated plan (or helpful empty state)

---

## [0.4.3] - 2025-12-28

### Fixed
- Keyboard shortcut `c` (clear) now properly ignores input when filter is focused
- Improved keyboard handler to use `document.activeElement` for reliable focus detection

---

## [0.4.2] - 2025-12-28

### Fixed
- Filter count now shows `X/Y` format when filter is active (e.g., `3/10` instead of just `10`)
- Plan selection persists when switching between sessions (plan is workspace-level, not session-level)
- Clear button now preserves plan selection (only clears events, sessions, and todos)

---

## [0.4.1] - 2025-12-28

### Fixed
- Version now reads dynamically from package.json instead of being hardcoded
- Added build-time version injection via esbuild

---

## 2025-12-28

### Added
- Session-specific todos with localStorage persistence
- Agent context stack - shows agent names (code-implementer, haiku-general-agent, etc.) in tool activity instead of "main"
- Distinct agent colors in tool activity (green for code-implementer, cyan for code-test-evaluator, orange for haiku-general-agent, etc.)
- Clear button (X) to remove stale session todos from localStorage
- Header session badge syncs with selected session filter
- Playwright MCP integration for browser automation testing

### Fixed
- Fixed crash when clicking THINKING pane (removed collapsibility)
- Hide todos/plan panels when "All" sessions is selected

---

## 2025-12-23

### Changed
- Replaced Agents panel with Todo panel for tracking task progress
- Updated navigation to view-based system (All/Thinking/Tools/Todo/Plan)
- Keyboard shortcuts changed from 0-9 agent switching to a/t/o/d/p view switching
- Simplified dashboard layout with session-based filtering instead of agent tabs
- Tool activity panel: collapsible entries (start collapsed), two-line collapsed view showing agent name
- Tool activity panel: removed OUTPUT section and running status indicator
- Plan viewer shows plan for selected session only; empty state when "All" sessions selected

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
