import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appContent = readFileSync(new URL('./app.ts', import.meta.url), 'utf-8');
const typesContent = readFileSync(new URL('./types.ts', import.meta.url), 'utf-8');
const stateContent = readFileSync(new URL('./state.ts', import.meta.url), 'utf-8');
const indexHtmlContent = readFileSync(new URL('./index.html', import.meta.url), 'utf-8');
const viewsContent = readFileSync(new URL('./ui/views.ts', import.meta.url), 'utf-8');
const keyboardContent = readFileSync(new URL('./ui/keyboard.ts', import.meta.url), 'utf-8');
const persistenceContent = readFileSync(new URL('./storage/persistence.ts', import.meta.url), 'utf-8');
const dispatcherContent = readFileSync(new URL('./handlers/dispatcher.ts', import.meta.url), 'utf-8');
const teamHandlerContent = readFileSync(new URL('./handlers/team.ts', import.meta.url), 'utf-8');
const tasksHandlerContent = readFileSync(new URL('./handlers/tasks.ts', import.meta.url), 'utf-8');
const toolsHandlerContent = readFileSync(new URL('./handlers/tools.ts', import.meta.url), 'utf-8');
const elementsContent = readFileSync(new URL('./ui/elements.ts', import.meta.url), 'utf-8');

describe('Collaboration Refactor: Team + Agents Merge', () => {
  describe('Session Scoping', () => {
    it('enforces strict selected-session filtering for message_sent rendering', () => {
      expect(teamHandlerContent).toContain('if (state.selectedSession === \'all\') return;');
      expect(teamHandlerContent).toContain('if (!event.sessionId || event.sessionId !== state.selectedSession) return;');
    });

    it('scopes team rendering to mapped selected session', () => {
      expect(teamHandlerContent).toContain('const teamSession = teamState.teamSessionMap.get(teamName);');
      expect(teamHandlerContent).toContain('if (!teamSession || teamSession !== state.selectedSession) {');
    });

    it('shows explicit unmapped-session empty state for tasks instead of cross-session fallback', () => {
      expect(tasksHandlerContent).toContain('No tasks mapped to this session yet');
      expect(tasksHandlerContent).toContain('if (!hasSessionMapping) {');
      expect(tasksHandlerContent).toContain("updateTabBadge('tasks', 0);");
    });

    it('propagates sessionId when converting SendMessage tool calls into message_sent', () => {
      expect(toolsHandlerContent).toContain('sessionId: string | undefined,');
      expect(toolsHandlerContent).toContain('specific.detectSendMessage(input, agentId, event.sessionId, event.timestamp);');
      expect(appContent).toContain('sessionId: string | undefined,');
      expect(appContent).toContain('sessionId,');
    });
  });

  describe('Merged Team Surface', () => {
    it('removes standalone agents handler module', () => {
      expect(existsSync(new URL('./handlers/agents-view.ts', import.meta.url))).toBe(false);
    });

    it('renders members, hierarchy, agents, and messages inside the Team panel', () => {
      const teamSectionStart = indexHtmlContent.indexOf('panel panel-team');
      const teamSectionEnd = indexHtmlContent.indexOf('</section>', teamSectionStart);
      const teamSection = indexHtmlContent.slice(teamSectionStart, teamSectionEnd);

      expect(teamSectionStart).toBeGreaterThanOrEqual(0);
      expect(teamSection).toContain('id="team-member-grid"');
      expect(teamSection).toContain('id="agent-tree-content"');
      expect(teamSection).toContain('id="team-agents-sidebar"');
      expect(teamSection).toContain('id="team-agents-detail"');
      expect(teamSection).toContain('id="team-messages"');
      expect(indexHtmlContent).not.toContain('panel panel-agents');
    });

    it('routes thinking and subagent updates through the unified Team handler', () => {
      expect(dispatcherContent).toContain('addTeamAgentThinking(event);');
      expect(dispatcherContent).toContain('refreshTeamAgentList();');
    });

    it('uses Team-specific embedded agent elements and not standalone agents panel elements', () => {
      expect(elementsContent).toContain('teamAgentsSidebar');
      expect(elementsContent).toContain('teamAgentsDetail');
      expect(elementsContent).not.toContain('agentsSidebar');
      expect(elementsContent).not.toContain('agentsDetail');
    });

    it('initializes and resets Team-owned agent thinking state from app startup flow', () => {
      expect(appContent).toContain('initTeam');
      expect(appContent).toContain('handleMessageSent');
      expect(appContent).toContain('resetTeamAgentThinking');
      expect(appContent).toContain('from \'./handlers/team.ts\'');
      expect(appContent).toContain('resetTeamAgentThinking();');
      expect(appContent).not.toContain('./handlers/agents-view.ts');
    });
  });

  describe('Navigation, State, and Persistence Migration', () => {
    it('drops agents as a top-level active view and panel visibility key', () => {
      expect(typesContent).not.toMatch(/activeView:[^\n]*'agents'/);
      expect(typesContent).not.toMatch(/\bagents:\s*boolean/);
      expect(stateContent).not.toContain('panelVisibility.agents');
      expect(stateContent).not.toContain('panelCollapseState.agents');
    });

    it('keeps Team view and removes Agents tab from view definitions', () => {
      expect(viewsContent).toContain("{ id: 'team', label: 'Team', shortcut: 'm' }");
      expect(viewsContent).not.toContain("{ id: 'agents'");
      expect(viewsContent).not.toMatch(/view-agents/);
    });

    it('maps keyboard alias "a" to Team view/panel behavior', () => {
      expect(keyboardContent).toMatch(/case 'a':\s+event\.preventDefault\(\);\s+togglePanelCollapse\('team'\);/);
      expect(keyboardContent).toMatch(/case 'a':\s+selectView\('team'\);/);
    });

    it('ignores legacy panel keys by validating against panel visibility schema', () => {
      expect(persistenceContent).toContain('const VALID_PANEL_NAMES: (keyof PanelVisibility)[] = [\'thinking\', \'tools\', \'hooks\', \'plan\', \'team\', \'tasks\', \'timeline\'];');
      expect(persistenceContent).toContain('if (isValidPanelName(key) && typeof value === \'boolean\') {');
    });
  });
});
