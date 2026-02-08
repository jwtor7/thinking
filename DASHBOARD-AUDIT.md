# Dashboard Audit Report

**Date**: 2026-02-07
**Version**: v1.0.10
**Scope**: Timeline, session filtering, thinking/tasks visibility

---

## Issue 1: Session chips show truncated UUIDs, never update to project names

**Severity**: HIGH | **File**: `src/dashboard/handlers/timeline.ts:265-275`

When `addOrUpdateSessionChip()` is called for a new session, it captures the label once from `getSessionDisplayName()`. If the session's `workingDirectory` hasn't been resolved yet (common for the first events), the label falls back to `sessionId.slice(0, 8)` — a truncated UUID like "d9ecd164".

The "already exists" branch (line 270-275) only updates the **count**, never the **label**. So the chip shows a cryptic UUID forever, even after the session's working directory becomes available.

**Suggested fix**: In the `addOrUpdateSessionChip` "already exists" branch, re-evaluate `getSessionDisplayName()` and update the chip's text content if a better name is now available.

---

## Issue 2: Session dropdown has multiple identical entries

**Severity**: HIGH | **File**: `src/dashboard/handlers/sessions.ts`

The session dropdown shows 7 entries all named "thinking" and 5 named "tru". The only differentiator is the status indicator (●, ○, ◌), which is subtle. Users can't tell which session is the current one without trial and error.

**Suggested fix**: Append start time or short session ID suffix to disambiguate — e.g., "thinking (14:35)" or "thinking [cb76]".

---

## Issue 3: Timeline type chip state persists as "all disabled" across page loads

**Severity**: MEDIUM | **File**: `src/dashboard/handlers/timeline.ts:160-211`

Type chips save their enabled/disabled state to `localStorage` (`tm-timeline-type-filter`). If a user disables all chips during an investigation, those chips remain disabled on the next page load. The timeline then shows only uncategorized events (session_start/stop), making it appear broken/empty with no obvious indication of why.

**Suggested fix**: Either (a) add a visible "Reset filters" button, (b) show a "N entries hidden by filters" message when all chips are disabled, or (c) reset filter state when a new session becomes active.

---

## Issue 4: `session_start`/`session_stop` events not in any type category

**Severity**: LOW | **File**: `src/dashboard/handlers/timeline.ts:68-75`

These event types aren't included in `TIMELINE_CATEGORIES`, so they pass through the type filter unconditionally (because `!elCategory` is always true for them). When all type chips are disabled, ONLY session events show — which is confusing and inconsistent.

**Suggested fix**: Add a "Sessions" category, or include them in an existing category like "Agents".

---

## Issue 5: No auto-selection of active session on page load

**Severity**: MEDIUM | **File**: `src/dashboard/handlers/sessions.ts`

On page load, the session dropdown defaults to either "All Sessions" or a previously-selected session from localStorage. If the saved selection was an old inactive session, the user sees stale/empty data and must manually find the current session in a list of identically-named entries (see Issue 2).

**Suggested fix**: On WebSocket connection, detect the most recently active session (highest `lastActivityTime`) and auto-select it if the saved session is no longer active.

---

## Issue 6: Timeline session chips override global session selector silently

**Severity**: LOW | **File**: `src/dashboard/handlers/timeline.ts:353-364`

When any timeline session chip is active, it overrides the global session dropdown for the timeline view only. This is undocumented — a user changing the global selector sees no effect on the timeline and doesn't understand why.

**Suggested fix**: Either show a visual indicator ("Filtered by session chips") when chips override the dropdown, or remove the override behavior and have chips always follow the global selector.

---

## Issue 7: Timeline 500-entry cap causes thinking entries to be lost

**Severity**: LOW | **File**: `src/dashboard/handlers/timeline.ts:20, 556-560`

The timeline caps at 500 entries (`MAX_TIMELINE_ENTRIES`). In a busy session generating ~1700 hook events and ~1600 tool events, the 500 slots fill quickly. Older thinking entries (much rarer, ~46 total) get pushed out by the flood of hook/tool events, making the timeline useless for reviewing past thinking.

**Suggested fix**: Consider per-category entry limits (e.g., always keep at least N thinking entries), increase the cap, or implement virtual scrolling.

---

## Summary

| # | Issue | Severity | Root Cause |
|---|-------|----------|------------|
| 1 | Session chips show UUIDs | HIGH | Label set once, never updated when session info arrives |
| 2 | Identical session names in dropdown | HIGH | Only folder name used, no disambiguator |
| 3 | Type chips persist as "all disabled" | MEDIUM | localStorage saves without recovery UX |
| 4 | session_start uncategorized | LOW | Missing from `TIMELINE_CATEGORIES` |
| 5 | No active session auto-select | MEDIUM | Relies on stale localStorage |
| 6 | Session chips silently override dropdown | LOW | Undocumented override behavior |
| 7 | Thinking entries lost in timeline cap | LOW | Flat 500 cap, no per-category quota |

## Root Cause of "Not Seeing Thinking or Tasks"

The core user experience problem — "not seeing any thinking or tasks" — is a combination of issues **#2**, **#3**, and **#5**:

1. The wrong session was auto-selected from stale localStorage (an old inactive "thinking" session)
2. The user couldn't easily find the right session because all 7 entries look identical
3. Type chips were persisted as disabled, so even the timeline appeared empty
