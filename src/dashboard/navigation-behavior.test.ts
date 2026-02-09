import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewsContent = readFileSync(new URL('./ui/views.ts', import.meta.url), 'utf-8');
const stateContent = readFileSync(new URL('./state.ts', import.meta.url), 'utf-8');
const timelineContent = readFileSync(new URL('./handlers/timeline.ts', import.meta.url), 'utf-8');
const sessionsContent = readFileSync(new URL('./handlers/sessions.ts', import.meta.url), 'utf-8');
const filtersContent = readFileSync(new URL('./ui/filters.ts', import.meta.url), 'utf-8');
const indexHtmlContent = readFileSync(new URL('./index.html', import.meta.url), 'utf-8');
const persistenceContent = readFileSync(new URL('./storage/persistence.ts', import.meta.url), 'utf-8');

describe('Dashboard Navigation Behavior', () => {
  it('should default to timeline view', () => {
    expect(stateContent).toContain("activeView: 'timeline'");
  });

  it('should render view tabs in timeline-first order', () => {
    const timelineIdx = viewsContent.indexOf("{ id: 'timeline', label: 'Timeline'");
    const thinkingIdx = viewsContent.indexOf("{ id: 'thinking', label: 'Thinking'");
    const toolsIdx = viewsContent.indexOf("{ id: 'tools', label: 'Tools'");
    const agentsIdx = viewsContent.indexOf("{ id: 'agents', label: 'Agents'");
    const hooksIdx = viewsContent.indexOf("{ id: 'hooks', label: 'Hooks'");
    const planIdx = viewsContent.indexOf("{ id: 'plan', label: 'Plan'");
    const tasksIdx = viewsContent.indexOf("{ id: 'tasks', label: 'Tasks'");
    const teamIdx = viewsContent.indexOf("{ id: 'team', label: 'Team'");

    expect(timelineIdx).toBeGreaterThanOrEqual(0);
    expect(timelineIdx).toBeLessThan(thinkingIdx);
    expect(thinkingIdx).toBeLessThan(toolsIdx);
    expect(toolsIdx).toBeLessThan(agentsIdx);
    expect(agentsIdx).toBeLessThan(hooksIdx);
    expect(hooksIdx).toBeLessThan(planIdx);
    expect(planIdx).toBeLessThan(tasksIdx);
    expect(tasksIdx).toBeLessThan(teamIdx);
  });

  it('should switch to timeline when hiding session-scoped tabs', () => {
    expect(viewsContent).toContain("selectView('timeline');");
  });

  it('should select session when navigating from timeline thinking entries', () => {
    expect(timelineContent).toContain('selectSession: (sessionId: string) => void;');
    expect(timelineContent).toContain('navigateToThinkingEntry(event.timestamp, resolvedSessionId)');
    expect(timelineContent).toContain('callbacks.selectSession(sessionId);');
  });

  it('should clear stale selected agent when session changes', () => {
    expect(sessionsContent).toContain('if (state.selectedSession !== resolvedSessionId)');
    expect(sessionsContent).toContain('state.selectedAgentId = null;');
  });

  it('should apply identical session/agent logic for new thinking and tool entries', () => {
    expect(filtersContent).toContain('export function applyThinkingFilter(entry: HTMLElement): void {');
    expect(filtersContent).toContain('export function applyToolsFilter(entry: HTMLElement): void {');
    expect(filtersContent).toContain('applySessionFilter(entry);');
  });

  it('should show collapse shortcut hints on panel buttons', () => {
    expect(indexHtmlContent).toContain('title="Collapse panel (Shift+L)"');
    expect(indexHtmlContent).toContain('title="Collapse panel (Shift+T)"');
    expect(indexHtmlContent).toContain('title="Collapse panel (Shift+O)"');
    expect(indexHtmlContent).toContain('title="Collapse panel (Shift+A)"');
    expect(indexHtmlContent).toContain('title="Collapse panel (Shift+H)"');
    expect(indexHtmlContent).toContain('title="Collapse panel (Shift+M)"');
    expect(indexHtmlContent).toContain('title="Collapse panel (Shift+K)"');
  });

  it('should restore collapsed panel titles with correct shortcuts', () => {
    expect(persistenceContent).toContain("case 'timeline':");
    expect(persistenceContent).toContain("case 'hooks':");
    expect(persistenceContent).toContain("case 'team':");
    expect(persistenceContent).toContain("case 'tasks':");
    expect(persistenceContent).toContain("btn.title = shortcutKey ? `Expand panel (Shift+${shortcutKey})` : 'Expand panel';");
  });
});
