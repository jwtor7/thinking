# Changelog

## [0.16.5] - 2026-01-10

### Added
- **Auto-open exported file** - After saving, the markdown file automatically opens in the system's default markdown viewer

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
