"use strict";
(() => {
  // src/dashboard/state.ts
  var subagentState = {
    subagents: /* @__PURE__ */ new Map(),
    sessionSubagents: /* @__PURE__ */ new Map(),
    agentChildren: /* @__PURE__ */ new Map()
  };
  var teamState = {
    teams: /* @__PURE__ */ new Map(),
    teamTasks: /* @__PURE__ */ new Map(),
    teamMessages: [],
    teamSessionMap: /* @__PURE__ */ new Map()
  };
  var activityTracker = {
    timestamps: [],
    /**
     * Head pointer for O(1) amortized pruning of old timestamps.
     * Avoids expensive Array.shift() in the activity loop.
     */
    headIndex: 0,
    eventsPerSec: 0
  };
  var state = {
    connected: false,
    autoScroll: true,
    userScrolledUp: false,
    eventCount: 0,
    thinkingCount: 0,
    toolsCount: 0,
    hooksCount: 0,
    agentsCount: 0,
    agents: /* @__PURE__ */ new Map(),
    pendingTools: /* @__PURE__ */ new Map(),
    thinkingFilter: "",
    toolsFilter: "",
    timelineFilter: "",
    reconnectAttempt: 0,
    reconnectCountdown: 0,
    keyboardMode: false,
    theme: "system",
    sessions: /* @__PURE__ */ new Map(),
    currentSessionId: null,
    selectedSession: "all",
    plans: /* @__PURE__ */ new Map(),
    currentPlanPath: null,
    planList: [],
    planSelectorOpen: false,
    contextMenuFilePath: null,
    activeView: "thinking",
    selectedAgentId: null,
    sessionPlanMap: /* @__PURE__ */ new Map(),
    panelCollapseState: {
      thinking: false,
      tools: false,
      hooks: false,
      plan: false,
      team: false,
      tasks: false,
      timeline: false,
      agents: false
    },
    panelVisibility: {
      thinking: true,
      tools: true,
      hooks: true,
      plan: true,
      team: true,
      tasks: true,
      timeline: true,
      agents: true
    }
  };
  var agentContextStack = ["main"];
  var agentContextTimestamps = /* @__PURE__ */ new Map();

  // src/dashboard/utils/debug.ts
  var isEnabled = () => {
    try {
      return localStorage.getItem("debug") === "true";
    } catch {
      return false;
    }
  };
  function debug(...args) {
    if (isEnabled()) {
      console.log(...args);
    }
  }

  // src/dashboard/config.ts
  var WS_URL = "ws://localhost:3355";
  var RECONNECT_BASE_DELAY_MS = 1e3;
  var RECONNECT_MAX_DELAY_MS = 3e4;
  var MAX_ENTRIES = 500;
  var SCROLL_THRESHOLD = 50;
  var STORAGE_KEY_PANEL_COLLAPSE = "thinking-monitor-panel-collapse-state";
  var STORAGE_KEY_PANEL_VISIBILITY = "thinking-monitor-panel-visibility";
  var STORAGE_KEY_THEME = "thinking-monitor-theme";
  var DEFAULT_THEME = "system";
  var PLAN_ASSOCIATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
  var PLAN_ASSOCIATION_MAX_ENTRIES = 100;
  var PLAN_ASSOCIATION_STORAGE_KEY = "sessionPlanAssociations";
  var MAX_AGENT_STACK_SIZE = 50;
  var AGENT_STACK_STALE_MS = 5 * 60 * 1e3;
  var AGENT_STACK_CLEANUP_INTERVAL_MS = 5 * 60 * 1e3;

  // src/dashboard/ui/elements.ts
  var elements = {
    connectionStatus: document.getElementById("connection-status"),
    sessionFilter: document.getElementById("session-filter"),
    exportBtn: document.getElementById("export-btn"),
    autoScrollCheckbox: document.getElementById("auto-scroll"),
    panelSelectorBtn: null,
    // Created dynamically in views.ts
    viewTabs: document.getElementById("view-tabs"),
    thinkingPanel: document.querySelector(".panel-thinking"),
    toolsPanel: document.querySelector(".panel-tools"),
    planPanel: document.querySelector(".panel-plan"),
    thinkingContent: document.getElementById("thinking-content"),
    thinkingCount: document.getElementById("thinking-count"),
    thinkingFilter: document.getElementById("thinking-filter"),
    thinkingFilterClear: document.getElementById("thinking-filter-clear"),
    toolsContent: document.getElementById("tools-content"),
    toolsCount: document.getElementById("tools-count"),
    toolsFilter: document.getElementById("tools-filter"),
    toolsFilterClear: document.getElementById("tools-filter-clear"),
    hooksPanel: document.querySelector(".panel-hooks"),
    hooksContent: document.getElementById("hooks-content"),
    hooksCount: document.getElementById("hooks-count"),
    hooksFilter: document.getElementById("hooks-filter"),
    hooksCollapseBtn: document.querySelector(".panel-hooks .panel-collapse-btn"),
    planContent: document.getElementById("plan-content"),
    planMeta: document.getElementById("plan-meta"),
    planOpenBtn: document.getElementById("plan-open-btn"),
    planRevealBtn: document.getElementById("plan-reveal-btn"),
    planSelectorBtn: document.getElementById("plan-selector-btn"),
    planSelectorText: document.getElementById("plan-selector-text"),
    planSelectorDropdown: document.getElementById("plan-selector-dropdown"),
    planContextMenu: document.getElementById("plan-context-menu"),
    contextMenuOpen: document.getElementById("context-menu-open"),
    contextMenuReveal: document.getElementById("context-menu-reveal"),
    serverInfo: document.getElementById("server-info"),
    eventCount: document.getElementById("event-count"),
    agentsCount: document.getElementById("agents-count"),
    connectionOverlay: document.getElementById("connection-overlay"),
    connectionOverlayMessage: document.getElementById("connection-overlay-message"),
    connectionOverlayRetry: document.getElementById("connection-overlay-retry"),
    panels: document.querySelector(".panels"),
    thinkingCollapseBtn: document.querySelector(".panel-thinking .panel-collapse-btn"),
    toolsCollapseBtn: document.querySelector(".panel-tools .panel-collapse-btn"),
    planCollapseBtn: document.querySelector(".panel-plan .panel-collapse-btn"),
    // Session context menu
    sessionContextMenu: document.getElementById("session-context-menu"),
    sessionContextMenuReveal: document.getElementById("session-context-menu-reveal"),
    // Status bar active session indicator
    activeSessionIndicator: document.getElementById("active-session-indicator"),
    // Session tooltip element (created dynamically)
    sessionTooltip: null,
    // Team panel elements
    teamPanel: document.querySelector(".panel-team"),
    teamName: document.getElementById("team-name"),
    teamMemberGrid: document.getElementById("team-member-grid"),
    teamMessages: document.getElementById("team-messages"),
    teamCollapseBtn: document.querySelector(".panel-team .panel-collapse-btn"),
    // Tasks panel elements
    tasksPanel: document.querySelector(".panel-tasks"),
    tasksPending: document.getElementById("tasks-pending"),
    tasksInProgress: document.getElementById("tasks-in-progress"),
    tasksCompleted: document.getElementById("tasks-completed"),
    tasksPendingCount: document.getElementById("tasks-pending-count"),
    tasksInProgressCount: document.getElementById("tasks-in-progress-count"),
    tasksCompletedCount: document.getElementById("tasks-completed-count"),
    tasksCollapseBtn: document.querySelector(".panel-tasks .panel-collapse-btn"),
    // Agent tree content (in the session filter area or dedicated section)
    agentTreeContent: document.getElementById("agent-tree-content"),
    // Timeline panel elements
    timelinePanel: document.querySelector(".panel-timeline"),
    timelineEntries: document.getElementById("timeline-entries"),
    timelineCount: document.getElementById("timeline-count"),
    timelineFilter: document.getElementById("timeline-filter"),
    timelineFilterClear: document.getElementById("timeline-filter-clear"),
    timelineCollapseBtn: document.querySelector(".panel-timeline .panel-collapse-btn"),
    timelineTypeChips: document.getElementById("timeline-type-chips"),
    timelineSessionChips: document.getElementById("timeline-session-chips"),
    // Activity pulse indicator
    activityPulse: document.getElementById("activity-pulse"),
    activityPulseDot: document.querySelector(".activity-pulse-dot"),
    activityPulseRate: document.querySelector(".activity-pulse-rate"),
    // Duration histogram
    durationHistogram: document.getElementById("tool-duration-histogram"),
    // Agents panel elements
    agentsPanel: document.querySelector(".panel-agents"),
    agentsSidebar: document.getElementById("agents-sidebar"),
    agentsDetail: document.getElementById("agents-detail"),
    agentsCollapseBtn: document.querySelector(".panel-agents .panel-collapse-btn"),
    // Stats bar
    statsBar: document.getElementById("stats-bar")
  };

  // src/dashboard/storage/persistence.ts
  function getPanelElements() {
    return {
      thinking: { panel: elements.thinkingPanel, btn: elements.thinkingCollapseBtn },
      tools: { panel: elements.toolsPanel, btn: elements.toolsCollapseBtn },
      hooks: { panel: elements.hooksPanel, btn: elements.hooksCollapseBtn },
      plan: { panel: elements.planPanel, btn: elements.planCollapseBtn },
      team: { panel: elements.teamPanel, btn: elements.teamCollapseBtn },
      tasks: { panel: elements.tasksPanel, btn: elements.tasksCollapseBtn },
      timeline: { panel: elements.timelinePanel, btn: elements.timelineCollapseBtn },
      agents: { panel: elements.agentsPanel, btn: elements.agentsCollapseBtn }
    };
  }
  function savePanelCollapseState() {
    try {
      localStorage.setItem(STORAGE_KEY_PANEL_COLLAPSE, JSON.stringify(state.panelCollapseState));
    } catch (error) {
      console.warn("[Dashboard] Failed to save panel collapse state:", error);
    }
  }
  function restorePanelCollapseState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PANEL_COLLAPSE);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (typeof parsed !== "object" || parsed === null) {
        console.warn("[Dashboard] Invalid stored panel collapse state, clearing");
        localStorage.removeItem(STORAGE_KEY_PANEL_COLLAPSE);
        return;
      }
      const panelElements = getPanelElements();
      for (const [panelName, isCollapsed] of Object.entries(parsed)) {
        if (panelName in state.panelCollapseState && typeof isCollapsed === "boolean") {
          state.panelCollapseState[panelName] = isCollapsed;
          const { panel, btn } = panelElements[panelName];
          if (panel && btn && isCollapsed) {
            panel.classList.add("collapsed");
            btn.setAttribute("aria-expanded", "false");
            btn.setAttribute("aria-label", `Expand ${panelName} panel`);
            const shortcutKey = panelName === "thinking" ? "T" : panelName === "tools" ? "O" : panelName === "agents" ? "A" : "P";
            btn.title = `Expand panel (Shift+${shortcutKey})`;
          }
        }
      }
      debug("[Dashboard] Restored panel collapse state from localStorage");
    } catch (error) {
      console.warn("[Dashboard] Failed to restore panel collapse state:", error);
    }
  }
  function pruneSessionPlanAssociations(associations) {
    const now = Date.now();
    const maxAge = PLAN_ASSOCIATION_MAX_AGE_MS;
    const maxEntries = PLAN_ASSOCIATION_MAX_ENTRIES;
    const entries = Object.entries(associations).filter(
      ([, assoc]) => now - assoc.timestamp < maxAge
    );
    if (entries.length > maxEntries) {
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      entries.length = maxEntries;
    }
    return Object.fromEntries(entries);
  }
  function loadSessionPlanAssociations() {
    try {
      const stored = localStorage.getItem(PLAN_ASSOCIATION_STORAGE_KEY);
      if (!stored) {
        debug("[Dashboard] No stored plan associations found in localStorage");
        return;
      }
      const parsed = JSON.parse(stored);
      if (typeof parsed !== "object" || parsed === null) {
        console.warn("[Dashboard] Invalid stored plan associations format, clearing");
        localStorage.removeItem(PLAN_ASSOCIATION_STORAGE_KEY);
        return;
      }
      const pruned = pruneSessionPlanAssociations(parsed);
      const originalCount = Object.keys(parsed).length;
      const prunedCount = Object.keys(pruned).length;
      if (prunedCount < originalCount) {
        debug(`[Dashboard] Pruned ${originalCount - prunedCount} stale plan associations`);
        localStorage.setItem(PLAN_ASSOCIATION_STORAGE_KEY, JSON.stringify(pruned));
      }
      state.sessionPlanMap.clear();
      for (const [sessionId, assoc] of Object.entries(pruned)) {
        state.sessionPlanMap.set(sessionId, assoc.planPath);
      }
      debug(`[Dashboard] Restored ${state.sessionPlanMap.size} plan associations from localStorage`);
    } catch (error) {
      console.warn("[Dashboard] Failed to restore plan associations from localStorage:", error);
    }
  }
  function saveSessionPlanAssociation(sessionId, planPath) {
    try {
      const stored = localStorage.getItem(PLAN_ASSOCIATION_STORAGE_KEY);
      let associations = {};
      if (stored) {
        try {
          associations = JSON.parse(stored);
          if (typeof associations !== "object" || associations === null) {
            associations = {};
          }
        } catch {
          associations = {};
        }
      }
      associations[sessionId] = {
        planPath,
        timestamp: Date.now()
      };
      associations = pruneSessionPlanAssociations(associations);
      localStorage.setItem(PLAN_ASSOCIATION_STORAGE_KEY, JSON.stringify(associations));
      debug(`[Dashboard] Saved plan association: ${sessionId.slice(0, 8)} -> ${planPath.split("/").pop()}`);
    } catch (error) {
      console.warn("[Dashboard] Failed to save plan association to localStorage:", error);
    }
  }
  var VALID_THEME_IDS = ["dark", "light", "solarized", "solarized-dark", "system"];
  function isValidThemeId(value) {
    return typeof value === "string" && VALID_THEME_IDS.includes(value);
  }
  function saveThemePreference(theme) {
    try {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
      debug(`[Dashboard] Saved theme preference: ${theme}`);
    } catch (error) {
      console.warn("[Dashboard] Failed to save theme preference to localStorage:", error);
    }
  }
  function loadThemePreference() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_THEME);
      if (stored && isValidThemeId(stored)) {
        debug(`[Dashboard] Loaded theme preference: ${stored}`);
        return stored;
      }
      debug(`[Dashboard] No valid theme preference found, using default: ${DEFAULT_THEME}`);
      return DEFAULT_THEME;
    } catch (error) {
      console.warn("[Dashboard] Failed to load theme preference from localStorage:", error);
      return DEFAULT_THEME;
    }
  }
  var DEFAULT_PANEL_VISIBILITY = {
    thinking: true,
    tools: true,
    hooks: true,
    plan: true,
    team: true,
    tasks: true,
    timeline: true,
    agents: true
  };
  var VALID_PANEL_NAMES = ["thinking", "tools", "hooks", "plan", "team", "tasks", "timeline", "agents"];
  function isValidPanelName(value) {
    return typeof value === "string" && VALID_PANEL_NAMES.includes(value);
  }
  function savePanelVisibility() {
    try {
      localStorage.setItem(STORAGE_KEY_PANEL_VISIBILITY, JSON.stringify(state.panelVisibility));
      debug("[Dashboard] Saved panel visibility settings");
    } catch (error) {
      console.warn("[Dashboard] Failed to save panel visibility to localStorage:", error);
    }
  }
  function loadPanelVisibility() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PANEL_VISIBILITY);
      if (!stored) {
        debug("[Dashboard] No panel visibility settings found, using defaults");
        return { ...DEFAULT_PANEL_VISIBILITY };
      }
      const parsed = JSON.parse(stored);
      if (typeof parsed !== "object" || parsed === null) {
        console.warn("[Dashboard] Invalid panel visibility format, using defaults");
        localStorage.removeItem(STORAGE_KEY_PANEL_VISIBILITY);
        return { ...DEFAULT_PANEL_VISIBILITY };
      }
      const result = { ...DEFAULT_PANEL_VISIBILITY };
      for (const [key, value] of Object.entries(parsed)) {
        if (isValidPanelName(key) && typeof value === "boolean") {
          result[key] = value;
        }
      }
      debug("[Dashboard] Loaded panel visibility settings from localStorage");
      return result;
    } catch (error) {
      console.warn("[Dashboard] Failed to load panel visibility from localStorage:", error);
      return { ...DEFAULT_PANEL_VISIBILITY };
    }
  }
  function restorePanelVisibility() {
    const visibility = loadPanelVisibility();
    state.panelVisibility = visibility;
    debug("[Dashboard] Restored panel visibility state");
  }

  // src/dashboard/ui/colors.ts
  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  var cssVarsInitialized = false;
  var SESSION_COLORS = [];
  var AGENT_COLORS = {};
  var AGENT_FALLBACK_COLORS = [];
  function initCssColors() {
    if (cssVarsInitialized) return;
    SESSION_COLORS = [
      getCssVar("--color-session-1"),
      // blue
      getCssVar("--color-session-2"),
      // green
      getCssVar("--color-session-3"),
      // purple
      getCssVar("--color-session-4"),
      // cyan
      getCssVar("--color-session-5"),
      // yellow
      getCssVar("--color-session-6"),
      // orange
      getCssVar("--color-session-7"),
      // red
      getCssVar("--color-session-8")
      // gray
    ];
    AGENT_COLORS = {
      "main": getCssVar("--color-agent-main"),
      // gray - main conversation (default)
      "code-implementer": getCssVar("--color-agent-code-implementer"),
      // green - implementation work
      "code-test-evaluator": getCssVar("--color-agent-code-test-evaluator"),
      // cyan/teal - testing/evaluation
      "haiku-general-agent": getCssVar("--color-agent-haiku"),
      // orange - haiku agent
      "opus-general-purpose": getCssVar("--color-agent-opus"),
      // gold/yellow - opus general purpose
      "general-purpose": getCssVar("--color-agent-general")
      // blue - general purpose (sonnet)
    };
    AGENT_FALLBACK_COLORS = [
      getCssVar("--color-agent-fallback-1"),
      // red
      getCssVar("--color-agent-fallback-2"),
      // purple
      getCssVar("--color-agent-fallback-3"),
      // coral
      getCssVar("--color-agent-fallback-4"),
      // light green
      getCssVar("--color-agent-fallback-5"),
      // light blue
      getCssVar("--color-agent-fallback-6")
      // peach
    ];
    cssVarsInitialized = true;
  }
  function getSessionColorByHash(sessionId) {
    initCssColors();
    if (!sessionId || SESSION_COLORS.length === 0) {
      return "var(--color-text-muted)";
    }
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    const colorIndex = Math.abs(hash) % SESSION_COLORS.length;
    return SESSION_COLORS[colorIndex];
  }
  function getSessionColorByFolder(folderName, fallbackSessionId) {
    initCssColors();
    const hashSource = folderName || fallbackSessionId;
    if (!hashSource || SESSION_COLORS.length === 0) {
      return "var(--color-text-muted)";
    }
    let hash = 0;
    for (let i = 0; i < hashSource.length; i++) {
      const char = hashSource.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    const colorIndex = Math.abs(hash) % SESSION_COLORS.length;
    return SESSION_COLORS[colorIndex];
  }
  function getAgentColor(agentName) {
    initCssColors();
    if (AGENT_COLORS[agentName]) {
      return AGENT_COLORS[agentName];
    }
    let hash = 0;
    for (let i = 0; i < agentName.length; i++) {
      hash = (hash << 5) - hash + agentName.charCodeAt(i);
      hash = hash & hash;
    }
    const index = Math.abs(hash) % AGENT_FALLBACK_COLORS.length;
    return AGENT_FALLBACK_COLORS[index];
  }
  var badgeColorsInitialized = false;
  var BADGE_COLORS = {};
  function initBadgeColors() {
    if (badgeColorsInitialized) return;
    BADGE_COLORS = {
      green: {
        bg: getCssVar("--color-badge-green-bg"),
        text: getCssVar("--color-badge-green-text")
      },
      yellow: {
        bg: getCssVar("--color-badge-yellow-bg"),
        text: getCssVar("--color-badge-yellow-text")
      },
      orange: {
        bg: getCssVar("--color-badge-orange-bg"),
        text: getCssVar("--color-badge-orange-text")
      },
      blue: {
        bg: getCssVar("--color-badge-blue-bg"),
        text: getCssVar("--color-badge-blue-text")
      },
      purple: {
        bg: getCssVar("--color-badge-purple-bg"),
        text: getCssVar("--color-badge-purple-text")
      },
      cyan: {
        bg: getCssVar("--color-badge-cyan-bg"),
        text: getCssVar("--color-badge-cyan-text")
      },
      red: {
        bg: getCssVar("--color-badge-red-bg"),
        text: getCssVar("--color-badge-red-text")
      },
      gray: {
        bg: getCssVar("--color-badge-gray-bg"),
        text: getCssVar("--color-badge-gray-text")
      }
    };
    badgeColorsInitialized = true;
  }
  var AGENT_BADGE_COLOR_MAP = {
    // Core agents
    "main": "gray",
    "code-implementer": "green",
    "code-test-evaluator": "cyan",
    "haiku-general-agent": "orange",
    "opus-general-purpose": "yellow",
    "general-purpose": "blue",
    // Subagent types (from Task tool)
    "Explore": "orange",
    "Plan": "green",
    "Bash": "purple",
    "Discover": "cyan",
    "Research": "blue"
  };
  var FALLBACK_BADGE_TYPES = ["red", "purple", "orange", "green", "blue", "cyan"];
  function getAgentBadgeColors(agentName) {
    initBadgeColors();
    const colorType = AGENT_BADGE_COLOR_MAP[agentName];
    if (colorType && BADGE_COLORS[colorType]) {
      return BADGE_COLORS[colorType];
    }
    let hash = 0;
    for (let i = 0; i < agentName.length; i++) {
      hash = (hash << 5) - hash + agentName.charCodeAt(i);
      hash = hash & hash;
    }
    const fallbackType = FALLBACK_BADGE_TYPES[Math.abs(hash) % FALLBACK_BADGE_TYPES.length];
    return BADGE_COLORS[fallbackType] || BADGE_COLORS.gray;
  }
  function resetColorCache() {
    cssVarsInitialized = false;
    badgeColorsInitialized = false;
    SESSION_COLORS = [];
    AGENT_COLORS = {};
    AGENT_FALLBACK_COLORS = [];
    BADGE_COLORS = {};
    debug("[Colors] Color cache reset - will re-read CSS variables on next access");
  }

  // src/dashboard/themes.ts
  var darkTheme = {
    bgPrimary: "#0d1117",
    bgSecondary: "#161b22",
    bgTertiary: "#21262d",
    bgHover: "#30363d",
    border: "#30363d",
    borderLight: "#21262d",
    textPrimary: "#e6edf3",
    textSecondary: "#8b949e",
    textMuted: "#848d97",
    accentBlue: "#58a6ff",
    accentGreen: "#3fb950",
    accentYellow: "#d29922",
    accentRed: "#f85149",
    accentPurple: "#a371f7",
    accentOrange: "#db6d28",
    accentCyan: "#39c5cf",
    surface0: "#0d1117",
    surface1: "#161b22",
    surface2: "#1c2128",
    surface3: "#21262d",
    surface4: "#282e36",
    surfaceOverlay: "rgba(22, 27, 34, 0.8)",
    surfaceGlass: "rgba(22, 27, 34, 0.6)",
    shadowSm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    shadowMd: "0 4px 6px rgba(0, 0, 0, 0.4)",
    shadowLg: "0 10px 15px rgba(0, 0, 0, 0.5)",
    shadowXl: "0 20px 25px rgba(0, 0, 0, 0.6)",
    shadowGlowGreen: "0 0 12px rgba(63, 185, 80, 0.4)",
    shadowGlowBlue: "0 0 12px rgba(88, 166, 255, 0.4)",
    shadowGlowRed: "0 0 12px rgba(248, 81, 73, 0.4)",
    focusRing: "rgba(88, 166, 255, 0.4)",
    hoverOverlay: "rgba(255, 255, 255, 0.05)",
    activeOverlay: "rgba(255, 255, 255, 0.1)",
    // Badge colors - darker backgrounds with white text for dark theme
    badgeGreenBg: "#238636",
    badgeGreenText: "#ffffff",
    badgeYellowBg: "#9e6a03",
    badgeYellowText: "#ffffff",
    badgeOrangeBg: "#9e6a03",
    badgeOrangeText: "#ffffff",
    badgeBlueBg: "#1f6feb",
    badgeBlueText: "#ffffff",
    badgePurpleBg: "#8957e5",
    badgePurpleText: "#ffffff",
    badgeCyanBg: "#0d7d87",
    badgeCyanText: "#ffffff",
    badgeRedBg: "#cf222e",
    badgeRedText: "#ffffff",
    badgeGrayBg: "#6e7681",
    badgeGrayText: "#ffffff"
  };
  var lightTheme = {
    bgPrimary: "#ffffff",
    bgSecondary: "#f6f8fa",
    bgTertiary: "#eaeef2",
    bgHover: "#d8dee4",
    border: "#d0d7de",
    borderLight: "#eaeef2",
    textPrimary: "#24292f",
    textSecondary: "#57606a",
    textMuted: "#6e7781",
    accentBlue: "#0969da",
    accentGreen: "#1a7f37",
    accentYellow: "#9a6700",
    accentRed: "#cf222e",
    accentPurple: "#8250df",
    accentOrange: "#bc4c00",
    accentCyan: "#0598bc",
    surface0: "#ffffff",
    surface1: "#f6f8fa",
    surface2: "#eaeef2",
    surface3: "#d8dee4",
    surface4: "#ced5dc",
    surfaceOverlay: "rgba(246, 248, 250, 0.9)",
    surfaceGlass: "rgba(246, 248, 250, 0.7)",
    shadowSm: "0 1px 2px rgba(0, 0, 0, 0.1)",
    shadowMd: "0 4px 6px rgba(0, 0, 0, 0.12)",
    shadowLg: "0 10px 15px rgba(0, 0, 0, 0.15)",
    shadowXl: "0 20px 25px rgba(0, 0, 0, 0.18)",
    shadowGlowGreen: "0 0 12px rgba(26, 127, 55, 0.3)",
    shadowGlowBlue: "0 0 12px rgba(9, 105, 218, 0.3)",
    shadowGlowRed: "0 0 12px rgba(207, 34, 46, 0.3)",
    focusRing: "rgba(9, 105, 218, 0.4)",
    hoverOverlay: "rgba(0, 0, 0, 0.04)",
    activeOverlay: "rgba(0, 0, 0, 0.08)",
    // Badge colors - pastel backgrounds with dark text for light theme
    badgeGreenBg: "rgba(26, 127, 55, 0.12)",
    badgeGreenText: "#116329",
    badgeYellowBg: "rgba(154, 103, 0, 0.12)",
    badgeYellowText: "#7a5200",
    badgeOrangeBg: "rgba(188, 76, 0, 0.12)",
    badgeOrangeText: "#953800",
    badgeBlueBg: "rgba(9, 105, 218, 0.12)",
    badgeBlueText: "#0550ae",
    badgePurpleBg: "rgba(130, 80, 223, 0.12)",
    badgePurpleText: "#6639ba",
    badgeCyanBg: "rgba(5, 152, 188, 0.12)",
    badgeCyanText: "#046d8b",
    badgeRedBg: "rgba(207, 34, 46, 0.12)",
    badgeRedText: "#a40e26",
    badgeGrayBg: "rgba(110, 119, 129, 0.12)",
    badgeGrayText: "#57606a"
  };
  var solarizedTheme = {
    bgPrimary: "#fdf6e3",
    bgSecondary: "#eee8d5",
    bgTertiary: "#e5dfc7",
    bgHover: "#d9d2b9",
    border: "#d9d2b9",
    borderLight: "#eee8d5",
    // Higher contrast: using base02, base01, base00 for darker text
    textPrimary: "#073642",
    // base02 - darkest text for maximum contrast
    textSecondary: "#586e75",
    // base01 - secondary emphasis
    textMuted: "#657b83",
    // base00 - muted but still readable
    accentBlue: "#268bd2",
    accentGreen: "#859900",
    accentYellow: "#b58900",
    accentRed: "#dc322f",
    accentPurple: "#6c71c4",
    accentOrange: "#cb4b16",
    accentCyan: "#2aa198",
    surface0: "#fdf6e3",
    surface1: "#eee8d5",
    surface2: "#e5dfc7",
    surface3: "#d9d2b9",
    surface4: "#ccc5ab",
    surfaceOverlay: "rgba(238, 232, 213, 0.9)",
    surfaceGlass: "rgba(238, 232, 213, 0.7)",
    shadowSm: "0 1px 2px rgba(0, 0, 0, 0.08)",
    shadowMd: "0 4px 6px rgba(0, 0, 0, 0.1)",
    shadowLg: "0 10px 15px rgba(0, 0, 0, 0.12)",
    shadowXl: "0 20px 25px rgba(0, 0, 0, 0.15)",
    shadowGlowGreen: "0 0 12px rgba(133, 153, 0, 0.3)",
    shadowGlowBlue: "0 0 12px rgba(38, 139, 210, 0.3)",
    shadowGlowRed: "0 0 12px rgba(220, 50, 47, 0.3)",
    focusRing: "rgba(38, 139, 210, 0.4)",
    hoverOverlay: "rgba(0, 0, 0, 0.04)",
    activeOverlay: "rgba(0, 0, 0, 0.08)",
    // Badge colors - warm pastel backgrounds with dark text for solarized light
    badgeGreenBg: "rgba(133, 153, 0, 0.15)",
    badgeGreenText: "#5b6a00",
    badgeYellowBg: "rgba(181, 137, 0, 0.15)",
    badgeYellowText: "#8a6800",
    badgeOrangeBg: "rgba(203, 75, 22, 0.15)",
    badgeOrangeText: "#a33d0f",
    badgeBlueBg: "rgba(38, 139, 210, 0.15)",
    badgeBlueText: "#1a6091",
    badgePurpleBg: "rgba(108, 113, 196, 0.15)",
    badgePurpleText: "#494d8a",
    badgeCyanBg: "rgba(42, 161, 152, 0.15)",
    badgeCyanText: "#1a6b65",
    badgeRedBg: "rgba(220, 50, 47, 0.15)",
    badgeRedText: "#a81f1c",
    badgeGrayBg: "rgba(101, 123, 131, 0.15)",
    badgeGrayText: "#586e75"
  };
  var solarizedDarkTheme = {
    bgPrimary: "#002b36",
    bgSecondary: "#073642",
    bgTertiary: "#0a4555",
    bgHover: "#0d5568",
    border: "#0d5568",
    borderLight: "#073642",
    // Higher contrast: using base2, base1, base0 for lighter text
    textPrimary: "#eee8d5",
    // base2 - lightest text for maximum contrast
    textSecondary: "#93a1a1",
    // base1 - secondary emphasis
    textMuted: "#839496",
    // base0 - muted but still readable
    accentBlue: "#268bd2",
    accentGreen: "#859900",
    accentYellow: "#b58900",
    accentRed: "#dc322f",
    accentPurple: "#6c71c4",
    accentOrange: "#cb4b16",
    accentCyan: "#2aa198",
    surface0: "#002b36",
    surface1: "#073642",
    surface2: "#0a4555",
    surface3: "#0d5568",
    surface4: "#10667b",
    surfaceOverlay: "rgba(7, 54, 66, 0.9)",
    surfaceGlass: "rgba(7, 54, 66, 0.7)",
    shadowSm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    shadowMd: "0 4px 6px rgba(0, 0, 0, 0.4)",
    shadowLg: "0 10px 15px rgba(0, 0, 0, 0.5)",
    shadowXl: "0 20px 25px rgba(0, 0, 0, 0.6)",
    shadowGlowGreen: "0 0 12px rgba(133, 153, 0, 0.4)",
    shadowGlowBlue: "0 0 12px rgba(38, 139, 210, 0.4)",
    shadowGlowRed: "0 0 12px rgba(220, 50, 47, 0.4)",
    focusRing: "rgba(38, 139, 210, 0.4)",
    hoverOverlay: "rgba(255, 255, 255, 0.05)",
    activeOverlay: "rgba(255, 255, 255, 0.1)",
    // Badge colors - muted solarized backgrounds with light text for dark theme
    badgeGreenBg: "#5b6a00",
    badgeGreenText: "#eee8d5",
    badgeYellowBg: "#8a6800",
    badgeYellowText: "#eee8d5",
    badgeOrangeBg: "#a33d0f",
    badgeOrangeText: "#eee8d5",
    badgeBlueBg: "#1a6091",
    badgeBlueText: "#eee8d5",
    badgePurpleBg: "#5458a0",
    badgePurpleText: "#eee8d5",
    badgeCyanBg: "#1a7a73",
    badgeCyanText: "#eee8d5",
    badgeRedBg: "#a81f1c",
    badgeRedText: "#eee8d5",
    badgeGrayBg: "#586e75",
    badgeGrayText: "#eee8d5"
  };
  var themes = {
    dark: darkTheme,
    light: lightTheme,
    solarized: solarizedTheme,
    "solarized-dark": solarizedDarkTheme
  };
  var themeDisplayNames = {
    system: "System",
    dark: "Dark",
    light: "Light",
    solarized: "Solarized",
    "solarized-dark": "Solarized Dark"
  };
  function getSystemTheme() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  }
  function watchSystemTheme(callback) {
    if (typeof window === "undefined" || !window.matchMedia) {
      return () => {
      };
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      callback(e.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }
  function applyTheme(themeId) {
    const resolvedThemeId = themeId === "system" ? getSystemTheme() : themeId;
    const colors = themes[resolvedThemeId];
    if (!colors) {
      console.warn(`[Themes] Unknown theme: ${themeId}, falling back to dark`);
      return applyTheme("dark");
    }
    const root = document.documentElement;
    root.style.setProperty("--color-bg-primary", colors.bgPrimary);
    root.style.setProperty("--color-bg-secondary", colors.bgSecondary);
    root.style.setProperty("--color-bg-tertiary", colors.bgTertiary);
    root.style.setProperty("--color-bg-hover", colors.bgHover);
    root.style.setProperty("--color-border", colors.border);
    root.style.setProperty("--color-border-light", colors.borderLight);
    root.style.setProperty("--color-text-primary", colors.textPrimary);
    root.style.setProperty("--color-text-secondary", colors.textSecondary);
    root.style.setProperty("--color-text-muted", colors.textMuted);
    root.style.setProperty("--color-accent-blue", colors.accentBlue);
    root.style.setProperty("--color-accent-green", colors.accentGreen);
    root.style.setProperty("--color-accent-yellow", colors.accentYellow);
    root.style.setProperty("--color-accent-red", colors.accentRed);
    root.style.setProperty("--color-accent-purple", colors.accentPurple);
    root.style.setProperty("--color-accent-orange", colors.accentOrange);
    root.style.setProperty("--color-accent-cyan", colors.accentCyan);
    root.style.setProperty("--color-surface-0", colors.surface0);
    root.style.setProperty("--color-surface-1", colors.surface1);
    root.style.setProperty("--color-surface-2", colors.surface2);
    root.style.setProperty("--color-surface-3", colors.surface3);
    root.style.setProperty("--color-surface-4", colors.surface4);
    root.style.setProperty("--color-surface-overlay", colors.surfaceOverlay);
    root.style.setProperty("--color-surface-glass", colors.surfaceGlass);
    root.style.setProperty("--shadow-sm", colors.shadowSm);
    root.style.setProperty("--shadow-md", colors.shadowMd);
    root.style.setProperty("--shadow-lg", colors.shadowLg);
    root.style.setProperty("--shadow-xl", colors.shadowXl);
    root.style.setProperty("--shadow-glow-green", colors.shadowGlowGreen);
    root.style.setProperty("--shadow-glow-blue", colors.shadowGlowBlue);
    root.style.setProperty("--shadow-glow-red", colors.shadowGlowRed);
    root.style.setProperty("--color-focus-ring", colors.focusRing);
    root.style.setProperty("--color-hover-overlay", colors.hoverOverlay);
    root.style.setProperty("--color-active-overlay", colors.activeOverlay);
    root.style.setProperty("--color-badge-green-bg", colors.badgeGreenBg);
    root.style.setProperty("--color-badge-green-text", colors.badgeGreenText);
    root.style.setProperty("--color-badge-yellow-bg", colors.badgeYellowBg);
    root.style.setProperty("--color-badge-yellow-text", colors.badgeYellowText);
    root.style.setProperty("--color-badge-orange-bg", colors.badgeOrangeBg);
    root.style.setProperty("--color-badge-orange-text", colors.badgeOrangeText);
    root.style.setProperty("--color-badge-blue-bg", colors.badgeBlueBg);
    root.style.setProperty("--color-badge-blue-text", colors.badgeBlueText);
    root.style.setProperty("--color-badge-purple-bg", colors.badgePurpleBg);
    root.style.setProperty("--color-badge-purple-text", colors.badgePurpleText);
    root.style.setProperty("--color-badge-cyan-bg", colors.badgeCyanBg);
    root.style.setProperty("--color-badge-cyan-text", colors.badgeCyanText);
    root.style.setProperty("--color-badge-red-bg", colors.badgeRedBg);
    root.style.setProperty("--color-badge-red-text", colors.badgeRedText);
    root.style.setProperty("--color-badge-gray-bg", colors.badgeGrayBg);
    root.style.setProperty("--color-badge-gray-text", colors.badgeGrayText);
    root.dataset.theme = resolvedThemeId;
    resetColorCache();
    debug(`[Themes] Applied theme: ${themeId}${themeId === "system" ? ` (resolved to ${resolvedThemeId})` : ""}`);
  }

  // src/dashboard/ui/theme-toggle.ts
  var systemThemeCleanup = null;
  var THEME_OPTIONS = ["system", "dark", "light", "solarized", "solarized-dark"];
  var THEME_ICONS = {
    system: "\u25D0",
    // Half circle (auto)
    dark: "\u263E",
    // Crescent moon
    light: "\u2600",
    // Sun
    solarized: "\u25D1",
    // Right half black
    "solarized-dark": "\u25D2"
    // Upper half black
  };
  var themeButton = null;
  function getNextTheme(currentTheme) {
    const currentIndex = THEME_OPTIONS.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
    return THEME_OPTIONS[nextIndex];
  }
  function createThemeButton() {
    const container = document.createElement("div");
    container.className = "theme-toggle";
    const button = document.createElement("button");
    button.id = "theme-toggle-btn";
    button.className = "btn btn-icon";
    button.setAttribute("aria-label", `Theme: ${themeDisplayNames[state.theme]}`);
    button.title = `Theme: ${themeDisplayNames[state.theme]} (click to change)`;
    const iconSpan = document.createElement("span");
    iconSpan.className = "btn-icon-theme";
    iconSpan.textContent = THEME_ICONS[state.theme];
    button.appendChild(iconSpan);
    container.appendChild(button);
    themeButton = button;
    return container;
  }
  function updateThemeButton(themeId) {
    if (!themeButton) return;
    const iconSpan = themeButton.querySelector(".btn-icon-theme");
    if (iconSpan) {
      iconSpan.textContent = THEME_ICONS[themeId];
    }
    themeButton.setAttribute("aria-label", `Theme: ${themeDisplayNames[themeId]}`);
    themeButton.title = `Theme: ${themeDisplayNames[themeId]} (click to change)`;
  }
  function handleThemeChange(themeId) {
    state.theme = themeId;
    applyTheme(themeId);
    saveThemePreference(themeId);
    updateThemeButton(themeId);
    if (systemThemeCleanup) {
      systemThemeCleanup();
      systemThemeCleanup = null;
    }
    if (themeId === "system") {
      systemThemeCleanup = watchSystemTheme((systemTheme) => {
        debug(`[Theme] System theme changed to: ${systemTheme}`);
        applyTheme("system");
      });
    }
  }
  function cycleTheme() {
    const nextTheme = getNextTheme(state.theme);
    handleThemeChange(nextTheme);
    debug(`[ThemeToggle] Cycled to theme: ${nextTheme}`);
  }
  function initThemeToggle(initialTheme) {
    const container = document.getElementById("theme-toggle-container");
    if (!container) {
      console.warn("[ThemeToggle] Container element not found");
      return;
    }
    state.theme = initialTheme;
    const buttonContainer = createThemeButton();
    container.appendChild(buttonContainer);
    themeButton?.addEventListener("click", cycleTheme);
    applyTheme(initialTheme);
    if (initialTheme === "system") {
      systemThemeCleanup = watchSystemTheme((systemTheme) => {
        debug(`[Theme] System theme changed to: ${systemTheme}`);
        applyTheme("system");
      });
    }
    debug(`[ThemeToggle] Initialized with theme: ${initialTheme}${initialTheme === "system" ? ` (resolved to ${getSystemTheme()})` : ""}`);
  }

  // src/dashboard/connection/websocket.ts
  var ws = null;
  var reconnectTimeout = null;
  var countdownInterval = null;
  var callbacks = null;
  function initWebSocket(cbs) {
    callbacks = cbs;
  }
  function connect() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return;
    }
    updateConnectionStatus("connecting");
    hideConnectionOverlay();
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      debug("[Dashboard] Connected to monitor server");
      state.connected = true;
      state.reconnectAttempt = 0;
      updateConnectionStatus("connected");
      hideConnectionOverlay();
      callbacks?.showToast("Connected to server", "success");
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    };
    ws.onclose = () => {
      debug("[Dashboard] Disconnected from monitor server");
      state.connected = false;
      updateConnectionStatus("disconnected");
      callbacks?.showToast("Connection lost", "error");
      scheduleReconnect();
    };
    ws.onerror = (error) => {
      console.error("[Dashboard] WebSocket error:", error);
    };
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        callbacks?.onEvent(message.event);
      } catch (error) {
        console.error("[Dashboard] Failed to parse message:", error);
      }
    };
  }
  function getWebSocket() {
    return ws;
  }
  function sendMessage(data) {
    if (ws?.readyState !== WebSocket.OPEN) {
      console.warn("[Dashboard] Cannot send message: WebSocket not connected");
      return false;
    }
    ws.send(JSON.stringify(data));
    return true;
  }
  function scheduleReconnect() {
    if (reconnectTimeout) {
      return;
    }
    state.reconnectAttempt++;
    const baseDelay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, state.reconnectAttempt - 1),
      RECONNECT_MAX_DELAY_MS
    );
    const jitter = Math.random() * 1e3;
    const delay = baseDelay + jitter;
    state.reconnectCountdown = Math.ceil(delay / 1e3);
    showConnectionOverlay();
    updateReconnectCountdown();
    countdownInterval = window.setInterval(() => {
      state.reconnectCountdown--;
      updateReconnectCountdown();
      if (state.reconnectCountdown <= 0 && countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1e3);
    reconnectTimeout = window.setTimeout(() => {
      reconnectTimeout = null;
      debug("[Dashboard] Attempting to reconnect...");
      connect();
    }, delay);
  }
  function retryNow() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    connect();
  }
  function updateReconnectCountdown() {
    elements.connectionOverlayMessage.textContent = `Reconnecting in ${state.reconnectCountdown}s... (attempt ${state.reconnectAttempt})`;
    const statusText = elements.connectionStatus.querySelector(".status-text");
    if (statusText && !state.connected) {
      statusText.innerHTML = `Reconnecting <span class="reconnect-countdown">${state.reconnectCountdown}s</span>`;
    }
  }
  function showConnectionOverlay() {
    elements.connectionOverlay.classList.add("visible");
  }
  function hideConnectionOverlay() {
    elements.connectionOverlay.classList.remove("visible");
  }
  function updateConnectionStatus(status) {
    const statusEl = elements.connectionStatus;
    statusEl.className = `status status-${status}`;
    let statusText = "Disconnected";
    if (status === "connected") {
      statusText = "Connected";
    } else if (status === "connecting") {
      statusText = "Connecting...";
    }
    const textEl = statusEl.querySelector(".status-text");
    if (textEl) {
      textEl.textContent = statusText;
    }
    if (status === "connected" || status === "disconnected") {
      callbacks?.announceStatus(status === "connected" ? "Connected to server" : "Disconnected from server");
    }
  }

  // src/dashboard/ui/views.ts
  var callbacks2 = null;
  function initViews(cbs) {
    callbacks2 = cbs;
  }
  function initViewTabs() {
    if (elements.viewTabs) {
      return;
    }
    const viewTabsContainer = document.createElement("nav");
    viewTabsContainer.id = "view-tabs";
    viewTabsContainer.className = "view-tabs";
    const views = [
      { id: "thinking", label: "Thinking", shortcut: "t" },
      { id: "tools", label: "Tools", shortcut: "o" },
      { id: "hooks", label: "Hooks", shortcut: "h" },
      { id: "team", label: "Team", shortcut: "m" },
      { id: "tasks", label: "Tasks", shortcut: "k" },
      { id: "timeline", label: "Timeline", shortcut: "l" },
      { id: "agents", label: "Agents", shortcut: "a" },
      { id: "plan", label: "Plan", shortcut: "p" }
    ];
    views.forEach((view) => {
      const tab = document.createElement("button");
      tab.className = `view-tab${state.activeView === view.id ? " active" : ""}`;
      tab.dataset.view = view.id;
      tab.innerHTML = `${view.label}<span class="tab-badge" data-badge-view="${view.id}"></span><span class="view-tab-shortcut">${view.shortcut}</span>`;
      tab.addEventListener("click", () => selectView(view.id));
      viewTabsContainer.appendChild(tab);
    });
    const spacer = document.createElement("div");
    spacer.className = "view-tabs-spacer";
    viewTabsContainer.appendChild(spacer);
    const panelSelectorBtn = document.createElement("button");
    panelSelectorBtn.id = "panel-selector-btn";
    panelSelectorBtn.className = "btn btn-icon";
    panelSelectorBtn.title = "Panel Settings (Shift+P)";
    panelSelectorBtn.setAttribute("aria-label", "Panel visibility settings");
    panelSelectorBtn.innerHTML = '<span class="btn-icon-gear">&#9881;</span>';
    panelSelectorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (callbacks2) {
        callbacks2.togglePanelSelector();
      }
    });
    viewTabsContainer.appendChild(panelSelectorBtn);
    elements.panelSelectorBtn = panelSelectorBtn;
    const header = document.querySelector(".header");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(viewTabsContainer, header.nextSibling);
    }
    elements.viewTabs = viewTabsContainer;
  }
  function selectView(viewId) {
    state.activeView = viewId;
    updateViewTabs();
    applyViewFilter();
  }
  function updateViewTabs() {
    if (!elements.viewTabs) return;
    const tabs = elements.viewTabs.querySelectorAll(".view-tab");
    tabs.forEach((tab) => {
      const tabEl = tab;
      if (tabEl.dataset.view === state.activeView) {
        tabEl.classList.add("active");
      } else {
        tabEl.classList.remove("active");
      }
    });
  }
  function updateSessionViewTabs(isAllSessions) {
    if (!elements.viewTabs) return;
    const planTab = elements.viewTabs.querySelector('[data-view="plan"]');
    const teamTab = elements.viewTabs.querySelector('[data-view="team"]');
    const tasksTab = elements.viewTabs.querySelector('[data-view="tasks"]');
    if (isAllSessions) {
      if (planTab) planTab.style.display = "none";
      if (teamTab) teamTab.style.display = "none";
      if (tasksTab) tasksTab.style.display = "none";
      if (state.activeView === "plan" || state.activeView === "team" || state.activeView === "tasks") {
        selectView("thinking");
      }
    } else {
      if (planTab) planTab.style.display = "";
      if (teamTab) teamTab.style.display = "";
      if (tasksTab) tasksTab.style.display = "";
    }
  }
  function applyViewFilter() {
    const panels = elements.panels;
    if (!panels) return;
    panels.classList.remove("view-thinking", "view-tools", "view-hooks", "view-plan", "view-team", "view-tasks", "view-timeline", "view-agents");
    panels.classList.add(`view-${state.activeView}`);
    panels.dataset.view = state.activeView;
    const pv = state.panelVisibility;
    const applyVisibility = (panel, isVisible) => {
      if (!panel) return;
      if (isVisible) {
        panel.classList.remove("panel-hidden");
        panel.style.display = "";
      } else {
        panel.classList.add("panel-hidden");
        panel.style.display = "none";
      }
    };
    applyVisibility(elements.thinkingPanel, pv.thinking && state.activeView === "thinking");
    applyVisibility(elements.toolsPanel, pv.tools && state.activeView === "tools");
    applyVisibility(elements.hooksPanel, pv.hooks && state.activeView === "hooks");
    applyVisibility(elements.planPanel, pv.plan && state.activeView === "plan");
    applyVisibility(elements.teamPanel, pv.team && state.activeView === "team");
    applyVisibility(elements.tasksPanel, pv.tasks && state.activeView === "tasks");
    applyVisibility(elements.timelinePanel, pv.timeline && state.activeView === "timeline");
    applyVisibility(elements.agentsPanel, pv.agents && state.activeView === "agents");
    panels.classList.add("single-view");
    const panelName = state.activeView;
    if (state.panelCollapseState[panelName]) {
      state.panelCollapseState[panelName] = false;
      const panelElements = {
        thinking: elements.thinkingPanel,
        tools: elements.toolsPanel,
        hooks: elements.hooksPanel,
        plan: elements.planPanel,
        team: elements.teamPanel,
        tasks: elements.tasksPanel,
        timeline: elements.timelinePanel,
        agents: elements.agentsPanel
      };
      const panel = panelElements[panelName];
      if (panel) {
        panel.classList.remove("collapsed");
      }
    }
    if (callbacks2) {
      callbacks2.announceStatus(`Switched to ${state.activeView} view`);
      callbacks2.focusActivePanel(state.activeView);
    }
  }
  function updateTabBadge(view, count) {
    const badge = document.querySelector(`.tab-badge[data-badge-view="${view}"]`);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 999 ? "999+" : String(count);
      badge.style.display = "";
    } else {
      badge.textContent = "";
      badge.style.display = "none";
    }
  }

  // src/dashboard/ui/resizer.ts
  var resizeState = {
    isResizing: false,
    startY: 0,
    startHeights: [],
    resizer: null,
    targets: []
  };
  var MIN_PANEL_HEIGHT = 80;
  function initResizers() {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("resizer-start", ((e) => {
      e.preventDefault();
      const { clientY, resizer, topPanel, bottomPanel } = e.detail;
      startResize(clientY, resizer, [topPanel, bottomPanel]);
    }));
    rebuildResizers();
  }
  function isPanelVisible(panel) {
    return !panel.classList.contains("collapsed") && !panel.classList.contains("session-hidden");
  }
  function removeAllResizers() {
    const panelsContainer = elements.panels;
    panelsContainer.querySelectorAll(".resizer-vertical").forEach((r) => r.remove());
  }
  function rebuildResizers() {
    removeAllResizers();
    const panelsContainer = elements.panels;
    const allPanels = Array.from(panelsContainer.querySelectorAll(":scope > .panel"));
    const visiblePanels = allPanels.filter(isPanelVisible);
    if (visiblePanels.length < 2) return;
    for (let i = 0; i < visiblePanels.length - 1; i++) {
      const topPanel = visiblePanels[i];
      const bottomPanel = visiblePanels[i + 1];
      const resizer = document.createElement("div");
      resizer.className = "resizer resizer-vertical";
      resizer.setAttribute("aria-hidden", "true");
      resizer.dataset.topPanel = topPanel.className;
      resizer.dataset.bottomPanel = bottomPanel.className;
      bottomPanel.before(resizer);
      resizer.addEventListener("mousedown", createResizerMouseDownHandler(topPanel, bottomPanel, resizer));
    }
  }
  function createResizerMouseDownHandler(topPanel, bottomPanel, resizer) {
    return (e) => {
      e.preventDefault();
      startResize(e.clientY, resizer, [topPanel, bottomPanel]);
    };
  }
  function startResize(startY, resizer, targets) {
    resizeState.isResizing = true;
    resizeState.startY = startY;
    resizeState.resizer = resizer;
    resizeState.targets = targets;
    resizeState.startHeights = targets.map((el) => el.offsetHeight);
    document.body.classList.add("resizing-vertical");
    resizer.classList.add("active");
  }
  function handleMouseMove(e) {
    if (!resizeState.isResizing) return;
    const { startY, startHeights, targets } = resizeState;
    const delta = e.clientY - startY;
    const newHeight0 = Math.max(MIN_PANEL_HEIGHT, startHeights[0] + delta);
    const newHeight1 = Math.max(MIN_PANEL_HEIGHT, startHeights[1] - delta);
    if (isPanelVisible(targets[0]) && isPanelVisible(targets[1])) {
      const total = newHeight0 + newHeight1;
      const ratio0 = newHeight0 / total;
      const ratio1 = newHeight1 / total;
      targets[0].style.flex = `${ratio0} 1 0`;
      targets[1].style.flex = `${ratio1} 1 0`;
    }
  }
  function handleMouseUp() {
    if (!resizeState.isResizing) return;
    document.body.classList.remove("resizing-vertical");
    resizeState.resizer?.classList.remove("active");
    resizeState.isResizing = false;
    resizeState.resizer = null;
    resizeState.targets = [];
  }
  function resetPanelFlex(panel) {
    panel.style.flex = "";
  }

  // src/dashboard/ui/panels.ts
  var callbacks3 = null;
  function initPanels(cbs) {
    callbacks3 = cbs;
  }
  function getPanelElements2() {
    return {
      thinking: { panel: elements.thinkingPanel, btn: elements.thinkingCollapseBtn },
      tools: { panel: elements.toolsPanel, btn: elements.toolsCollapseBtn },
      hooks: { panel: elements.hooksPanel, btn: elements.hooksCollapseBtn },
      plan: { panel: elements.planPanel, btn: elements.planCollapseBtn },
      team: { panel: elements.teamPanel, btn: elements.teamCollapseBtn },
      tasks: { panel: elements.tasksPanel, btn: elements.tasksCollapseBtn },
      timeline: { panel: elements.timelinePanel, btn: elements.timelineCollapseBtn },
      agents: { panel: elements.agentsPanel, btn: elements.agentsCollapseBtn }
    };
  }
  function getShortcutKey(panelName) {
    switch (panelName) {
      case "thinking":
        return "T";
      case "tools":
        return "O";
      case "hooks":
        return null;
      case "plan":
        return null;
      // Shift+P is used for panel selector
      case "team":
        return "M";
      case "tasks":
        return "K";
      case "timeline":
        return "L";
      case "agents":
        return "A";
    }
  }
  function togglePanelCollapse(panelName) {
    const panelElements = getPanelElements2();
    const { panel, btn } = panelElements[panelName];
    if (!panel || !btn) return;
    const isCollapsed = !state.panelCollapseState[panelName];
    state.panelCollapseState[panelName] = isCollapsed;
    panel.classList.toggle("collapsed", isCollapsed);
    btn.setAttribute("aria-expanded", String(!isCollapsed));
    btn.setAttribute("aria-label", `${isCollapsed ? "Expand" : "Collapse"} ${panelName} panel`);
    const shortcutKey = getShortcutKey(panelName);
    btn.title = shortcutKey ? `${isCollapsed ? "Expand" : "Collapse"} panel (Shift+${shortcutKey})` : `${isCollapsed ? "Expand" : "Collapse"} panel`;
    resetPanelFlex(panel);
    rebuildResizers();
    savePanelCollapseState();
    if (callbacks3) {
      callbacks3.announceStatus(`${panelName} panel ${isCollapsed ? "collapsed" : "expanded"}`);
    }
    debug(`[Dashboard] Panel ${panelName} ${isCollapsed ? "collapsed" : "expanded"}`);
  }
  function initPanelCollapseButtons() {
    const panelElements = getPanelElements2();
    for (const [panelName, { btn }] of Object.entries(panelElements)) {
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          togglePanelCollapse(panelName);
        });
      }
    }
  }

  // src/dashboard/ui/drag-reorder.ts
  var dragState = {
    isDragging: false,
    draggedPanel: null,
    placeholder: null,
    startY: 0,
    offsetY: 0
  };
  function initDragReorder() {
    const panelsContainer = elements.panels;
    panelsContainer.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove2);
    document.addEventListener("mouseup", handleMouseUp2);
  }
  function handleMouseDown(e) {
    const target = e.target;
    const header = target.closest(".panel-header");
    if (!header) return;
    if (target.closest(".panel-collapse-btn, .panel-filter, .panel-badge, .plan-selector-wrapper, .plan-actions")) {
      return;
    }
    const panel = header.closest(".panel");
    if (!panel) return;
    if (!panel.classList.contains("collapsed")) return;
    e.preventDefault();
    startDrag(panel, e.clientY);
  }
  function startDrag(panel, clientY) {
    dragState.isDragging = true;
    dragState.draggedPanel = panel;
    const rect = panel.getBoundingClientRect();
    dragState.startY = clientY;
    dragState.offsetY = clientY - rect.top;
    const placeholder = document.createElement("div");
    placeholder.className = "drag-placeholder";
    placeholder.style.height = `${rect.height}px`;
    dragState.placeholder = placeholder;
    panel.parentNode?.insertBefore(placeholder, panel);
    panel.classList.add("dragging");
    panel.style.position = "fixed";
    panel.style.width = `${rect.width}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.zIndex = "1000";
    panel.style.pointerEvents = "none";
    document.body.classList.add("dragging-panel");
  }
  function handleMouseMove2(e) {
    if (!dragState.isDragging || !dragState.draggedPanel || !dragState.placeholder) return;
    const panel = dragState.draggedPanel;
    panel.style.top = `${e.clientY - dragState.offsetY}px`;
    const panelsContainer = elements.panels;
    const allPanels = Array.from(panelsContainer.querySelectorAll(":scope > .panel:not(.dragging)"));
    const placeholder = dragState.placeholder;
    let insertBefore = null;
    for (const otherPanel of allPanels) {
      const rect = otherPanel.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        insertBefore = otherPanel;
        break;
      }
    }
    if (insertBefore && insertBefore !== placeholder.nextElementSibling) {
      let target = insertBefore;
      const prev = insertBefore.previousElementSibling;
      if (prev?.classList.contains("resizer-vertical")) {
        target = prev;
      }
      panelsContainer.insertBefore(placeholder, target);
    } else if (!insertBefore) {
      panelsContainer.appendChild(placeholder);
    }
  }
  function handleMouseUp2() {
    if (!dragState.isDragging || !dragState.draggedPanel || !dragState.placeholder) return;
    const panel = dragState.draggedPanel;
    const placeholder = dragState.placeholder;
    panel.classList.remove("dragging");
    panel.style.position = "";
    panel.style.width = "";
    panel.style.top = "";
    panel.style.left = "";
    panel.style.zIndex = "";
    panel.style.pointerEvents = "";
    placeholder.parentNode?.insertBefore(panel, placeholder);
    placeholder.remove();
    document.body.classList.remove("dragging-panel");
    dragState.isDragging = false;
    dragState.draggedPanel = null;
    dragState.placeholder = null;
    rebuildResizers();
  }

  // src/dashboard/utils/formatting.ts
  function formatTime(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return "--:--:--";
    }
  }
  function formatDuration(ms) {
    if (ms < 1e3) {
      return `${ms}ms`;
    }
    const seconds = (ms / 1e3).toFixed(1);
    return `${seconds}s`;
  }
  function formatElapsed(ms) {
    if (ms < 6e4) {
      return "<1m";
    }
    const totalMinutes = Math.floor(ms / 6e4);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
      return `${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  }
  function getDurationClass(ms) {
    if (ms < 1e3) {
      return "duration-fast";
    } else if (ms < 5e3) {
      return "duration-medium";
    } else if (ms < 15e3) {
      return "duration-slow";
    } else {
      return "duration-very-slow";
    }
  }
  function shortenToolName(name) {
    const mcpMatch = name.match(/^mcp__[^_]+(?:__)?(.+)$/);
    if (mcpMatch) {
      return mcpMatch[1];
    }
    return name;
  }
  function summarizeInput(input, toolName) {
    if (!input) return "";
    if (toolName) {
      const shortName = shortenToolName(toolName);
      try {
        const parsed = JSON.parse(input);
        const KNOWN_TOOLS = /* @__PURE__ */ new Set([
          "Read",
          "Write",
          "Edit",
          "Bash",
          "Grep",
          "Glob",
          "Task",
          "WebFetch",
          "WebSearch",
          "computer",
          "navigate",
          "find",
          "form_input"
        ]);
        const isKnownTool = KNOWN_TOOLS.has(shortName);
        switch (shortName) {
          case "Read":
          case "Write":
          case "Edit":
            if (parsed.file_path) return parsed.file_path;
            break;
          case "Bash":
            if (parsed.command) {
              const cmd = parsed.command;
              return cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd;
            }
            break;
          case "Grep":
            if (parsed.pattern) {
              const parts = [parsed.pattern];
              if (parsed.path) parts.push(parsed.path);
              const result = parts.join(" in ");
              return result.length > 80 ? result.slice(0, 80) + "..." : result;
            }
            break;
          case "Glob":
            if (parsed.pattern) return parsed.pattern;
            break;
          case "Task":
            if (parsed.subagent_type || parsed.description) {
              const parts = [];
              if (parsed.subagent_type) parts.push(parsed.subagent_type);
              if (parsed.description) parts.push(parsed.description);
              const result = parts.join(": ");
              return result.length > 80 ? result.slice(0, 80) + "..." : result;
            }
            break;
          case "WebFetch":
            if (parsed.url) {
              return parsed.url.length > 80 ? parsed.url.slice(0, 80) + "..." : parsed.url;
            }
            break;
          case "WebSearch":
            if (parsed.query) return parsed.query;
            break;
          // MCP browser tools
          case "computer": {
            const parts = [];
            if (parsed.action) parts.push(parsed.action);
            if (parsed.coordinate) parts.push(`(${parsed.coordinate})`);
            if (parsed.text) parts.push(`"${parsed.text.length > 30 ? parsed.text.slice(0, 30) + "..." : parsed.text}"`);
            if (parsed.ref) parts.push(parsed.ref);
            if (parts.length > 0) return parts.join(" ");
            break;
          }
          case "navigate":
            if (parsed.url) return parsed.url.length > 80 ? parsed.url.slice(0, 80) + "..." : parsed.url;
            break;
          case "find":
            if (parsed.query) return parsed.query;
            break;
          case "form_input":
            if (parsed.ref && parsed.value != null) return `${parsed.ref} = ${String(parsed.value).slice(0, 40)}`;
            break;
        }
        if (!isKnownTool && typeof parsed === "object" && parsed !== null) {
          const pairs = Object.entries(parsed).filter(([, v]) => typeof v !== "object" && String(v).length < 40).slice(0, 4).map(([k, v]) => `${k}:${v}`);
          if (pairs.length > 0) {
            const result = pairs.join(", ");
            return result.length > 80 ? result.slice(0, 80) + "..." : result;
          }
        }
      } catch {
      }
    }
    const pathMatch = input.match(/\/[^\s"']+/);
    if (pathMatch) {
      return pathMatch[0];
    }
    if (input.length > 60) {
      return input.slice(0, 60) + "...";
    }
    return input;
  }

  // src/dashboard/utils/html.ts
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function encodeHtmlAttribute(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeCssValue(value) {
    return value.replace(/[^a-zA-Z0-9 #.,%()/\-]/g, "");
  }

  // src/dashboard/handlers/team.ts
  var MAX_MESSAGES = 200;
  var callbacks4 = null;
  function initTeam(cbs) {
    callbacks4 = cbs;
  }
  function renderMemberGrid(teamName) {
    const memberGrid = elements.teamMemberGrid;
    if (!memberGrid) return;
    const members = teamState.teams.get(teamName);
    if (!members || members.length === 0) {
      memberGrid.innerHTML = `<div class="team-empty">No team members</div>`;
      return;
    }
    memberGrid.innerHTML = members.map((member) => {
      const badgeColors = getAgentBadgeColors(member.agentType || member.name);
      const statusClass = `team-member-status-${member.status || "active"}`;
      const statusDot = member.status === "idle" ? "idle" : member.status === "shutdown" ? "shutdown" : "active";
      return `
      <div class="team-member-card ${statusClass}">
        <div class="team-member-header">
          <span class="team-member-dot team-member-dot-${statusDot}"></span>
          <span class="team-member-name">${escapeHtml(member.name)}</span>
        </div>
        <span class="team-member-type" style="background: ${escapeCssValue(badgeColors.bg)}; color: ${escapeCssValue(badgeColors.text)}">${escapeHtml(member.agentType)}</span>
      </div>
    `;
    }).join("");
    memberGrid.querySelectorAll(".team-member-card").forEach((card, index) => {
      const member = members[index];
      if (!member) return;
      card.style.cursor = "pointer";
      card.title = `Click to filter events by ${member.name}`;
      card.addEventListener("click", () => {
        let agentId = null;
        for (const [id, mapping] of subagentState.subagents) {
          if (mapping.agentName === member.name) {
            agentId = id;
            break;
          }
        }
        if (agentId) {
          if (state.selectedAgentId === agentId) {
            selectAgentFilter(null);
          } else {
            selectAgentFilter(agentId);
          }
        }
      });
    });
  }
  function updateTeamHeader(teamName) {
    const teamNameEl = elements.teamName;
    if (teamNameEl) {
      teamNameEl.textContent = teamName;
    }
  }
  function handleTeamUpdate(event) {
    if (!callbacks4) return;
    const teamName = event.teamName;
    teamState.teams.set(teamName, event.members);
    resolveTeamSession(teamName, event.sessionId, event.members);
    const teamSession = teamState.teamSessionMap.get(teamName);
    if (state.selectedSession === "all") {
      return;
    }
    if (teamSession && teamSession !== state.selectedSession) {
      return;
    }
    callbacks4.showTeamPanel();
    updateTeamHeader(teamName);
    renderMemberGrid(teamName);
    const memberCount = event.members.length;
    updateTabBadge("team", memberCount);
  }
  function resolveTeamSession(teamName, sessionId, members) {
    if (sessionId) {
      teamState.teamSessionMap.set(teamName, sessionId);
      return;
    }
    if (members) {
      for (const member of members) {
        for (const [, mapping] of subagentState.subagents) {
          if (mapping.agentName === member.name) {
            teamState.teamSessionMap.set(teamName, mapping.parentSessionId);
            return;
          }
        }
      }
    }
  }
  function filterTeamBySession() {
    const teamContent = elements.teamMemberGrid?.parentElement;
    if (!teamContent) return;
    if (state.selectedSession === "all") {
      const teamNameEl = elements.teamName;
      if (teamNameEl) teamNameEl.textContent = "";
      const memberGrid = elements.teamMemberGrid;
      if (memberGrid) memberGrid.innerHTML = "";
      return;
    }
    let matchedTeam = null;
    for (const [teamName, sessionId] of teamState.teamSessionMap) {
      if (sessionId === state.selectedSession) {
        matchedTeam = teamName;
        break;
      }
    }
    if (matchedTeam) {
      updateTeamHeader(matchedTeam);
      renderMemberGrid(matchedTeam);
    } else {
      const teamNameEl = elements.teamName;
      if (teamNameEl) {
        teamNameEl.textContent = "No team";
      }
      const memberGrid = elements.teamMemberGrid;
      if (memberGrid) {
        memberGrid.innerHTML = `<div class="team-empty">No team for this session</div>`;
      }
    }
  }
  function handleTeammateIdle(event) {
    if (!callbacks4) return;
    const teamName = event.teamName;
    if (!teamName) return;
    const members = teamState.teams.get(teamName);
    if (members) {
      const member = members.find((m) => m.name === event.teammateName);
      if (member) {
        member.status = "idle";
      }
    }
    const teamSession = teamState.teamSessionMap.get(teamName);
    if (state.selectedSession === "all") return;
    if (teamSession && teamSession !== state.selectedSession) return;
    if (members) {
      renderMemberGrid(teamName);
    }
    callbacks4.showTeamPanel();
  }
  function handleMessageSent(event) {
    if (!callbacks4) return;
    teamState.teamMessages.push(event);
    if (teamState.teamMessages.length > MAX_MESSAGES) {
      teamState.teamMessages.shift();
    }
    if (state.selectedSession === "all") return;
    if (event.sessionId && event.sessionId !== state.selectedSession) return;
    callbacks4.showTeamPanel();
    const messagesContainer = elements.teamMessages;
    if (!messagesContainer) return;
    const emptyState2 = messagesContainer.querySelector(".empty-state");
    if (emptyState2) {
      emptyState2.remove();
    }
    const entry = document.createElement("div");
    entry.className = `team-message team-message-${event.messageType}`;
    entry.dataset.timestamp = String(Date.now());
    const time = formatTime(event.timestamp);
    const senderColors = getAgentBadgeColors(event.sender);
    const recipientColors = getAgentBadgeColors(event.recipient);
    const isBroadcast = event.messageType === "broadcast";
    const isShutdown = event.messageType === "shutdown_request" || event.messageType === "shutdown_response";
    let typeIcon = "";
    if (isBroadcast) typeIcon = '<span class="team-message-type-icon" title="Broadcast">&#128226;</span>';
    else if (isShutdown) typeIcon = '<span class="team-message-type-icon team-message-shutdown" title="Shutdown">&#9724;</span>';
    const recipientLabel = isBroadcast ? '<span class="team-message-broadcast-label">all</span>' : `<span class="team-message-badge" style="background: ${escapeCssValue(recipientColors.bg)}; color: ${escapeCssValue(recipientColors.text)}">${escapeHtml(event.recipient)}</span>`;
    entry.innerHTML = `
    <div class="team-message-header">
      <span class="team-message-time">${escapeHtml(time)}</span>
      ${typeIcon}
      <span class="team-message-badge" style="background: ${escapeCssValue(senderColors.bg)}; color: ${escapeCssValue(senderColors.text)}">${escapeHtml(event.sender)}</span>
      <span class="team-message-arrow">&#8594;</span>
      ${recipientLabel}
    </div>
    ${event.summary ? `<div class="team-message-summary">${escapeHtml(event.summary)}</div>` : ""}
  `;
    callbacks4.appendAndTrim(messagesContainer, entry);
    callbacks4.smartScroll(messagesContainer);
    entry.classList.add("new");
    setTimeout(() => entry.classList.remove("new"), 1e3);
  }

  // src/dashboard/handlers/tasks.ts
  var callbacks5 = null;
  function initTasks(cbs) {
    callbacks5 = cbs;
  }
  function renderTaskCard(task) {
    const ownerBadge = task.owner ? (() => {
      const colors = getAgentBadgeColors(task.owner);
      return `<span class="task-owner-badge" style="background: ${escapeCssValue(colors.bg)}; color: ${escapeCssValue(colors.text)}">${escapeHtml(task.owner)}</span>`;
    })() : '<span class="task-unassigned">unassigned</span>';
    const blockedIndicators = task.blockedBy.length > 0 ? `<div class="task-blocked-by">blocked by: ${task.blockedBy.map((id) => `<span class="task-blocked-id">#${escapeHtml(id)}</span>`).join(", ")}</div>` : "";
    const statusIcon = task.status === "completed" ? "&#10003;" : task.status === "in_progress" ? "&#9654;" : "&#9679;";
    return `
    <div class="task-card task-card-${task.status}" data-task-id="${escapeHtml(task.id)}" data-timestamp="${Date.now()}">
      <div class="task-card-header">
        <span class="task-card-id">#${escapeHtml(task.id)}</span>
        <span class="task-card-status-icon">${statusIcon}</span>
      </div>
      <div class="task-card-subject">${escapeHtml(task.subject)}</div>
      <div class="task-card-footer">
        ${ownerBadge}
        ${blockedIndicators}
      </div>
    </div>
  `;
  }
  function renderTaskBoard() {
    const pendingCol = elements.tasksPending;
    const progressCol = elements.tasksInProgress;
    const completedCol = elements.tasksCompleted;
    if (!pendingCol || !progressCol || !completedCol) return;
    const allTasks = [];
    if (state.selectedSession === "all") {
      for (const tasks of teamState.teamTasks.values()) {
        allTasks.push(...tasks);
      }
    } else {
      for (const [teamName, sessionId] of teamState.teamSessionMap) {
        if (sessionId === state.selectedSession) {
          const tasks = teamState.teamTasks.get(teamName);
          if (tasks) allTasks.push(...tasks);
        }
      }
      if (allTasks.length === 0) {
        for (const tasks of teamState.teamTasks.values()) {
          allTasks.push(...tasks);
        }
      }
    }
    const pending = allTasks.filter((t) => t.status === "pending");
    const inProgress = allTasks.filter((t) => t.status === "in_progress");
    const completed = allTasks.filter((t) => t.status === "completed");
    if (elements.tasksPendingCount) {
      elements.tasksPendingCount.textContent = String(pending.length);
    }
    if (elements.tasksInProgressCount) {
      elements.tasksInProgressCount.textContent = String(inProgress.length);
    }
    if (elements.tasksCompletedCount) {
      elements.tasksCompletedCount.textContent = String(completed.length);
    }
    pendingCol.innerHTML = pending.length > 0 ? pending.map(renderTaskCard).join("") : '<div class="task-column-empty">No pending tasks</div>';
    progressCol.innerHTML = inProgress.length > 0 ? inProgress.map(renderTaskCard).join("") : '<div class="task-column-empty">No active tasks</div>';
    completedCol.innerHTML = completed.length > 0 ? completed.map(renderTaskCard).join("") : '<div class="task-column-empty">No completed tasks</div>';
    const totalCount = allTasks.length;
    updateTabBadge("tasks", totalCount);
    const totalCountEl = document.getElementById("tasks-total-count");
    if (totalCountEl) {
      totalCountEl.textContent = String(totalCount);
    }
    const taskBoard = document.querySelector(".task-board");
    if (taskBoard) {
      taskBoard.querySelectorAll(".task-owner-badge").forEach((badge) => {
        const ownerName = badge.textContent?.trim();
        if (!ownerName) return;
        badge.style.cursor = "pointer";
        badge.title = `Click to filter by ${ownerName}`;
        badge.addEventListener("click", (e) => {
          e.stopPropagation();
          let agentId = null;
          for (const [id, mapping] of subagentState.subagents) {
            if (mapping.agentName === ownerName) {
              agentId = id;
              break;
            }
          }
          if (agentId) {
            if (state.selectedAgentId === agentId) {
              selectAgentFilter(null);
            } else {
              selectAgentFilter(agentId);
            }
          }
        });
      });
    }
  }
  function filterTasksBySession() {
    renderTaskBoard();
  }
  function handleTaskUpdate(event) {
    if (!callbacks5) return;
    const prev = teamState.teamTasks.get(event.teamId);
    if (prev) {
      const incomingIds = new Set(event.tasks.map((t) => t.id));
      const retainedCompleted = prev.filter(
        (t) => t.status === "completed" && !incomingIds.has(t.id)
      );
      teamState.teamTasks.set(event.teamId, [...event.tasks, ...retainedCompleted]);
    } else {
      teamState.teamTasks.set(event.teamId, event.tasks);
    }
    callbacks5.showTasksPanel();
    renderTaskBoard();
  }
  function handleTaskCompleted(event) {
    if (!callbacks5) return;
    const teamId = event.teamId || "";
    const tasks = teamState.teamTasks.get(teamId);
    if (tasks) {
      const task = tasks.find((t) => t.id === event.taskId);
      if (task) {
        task.status = "completed";
      }
    }
    callbacks5.showTasksPanel();
    renderTaskBoard();
  }

  // src/dashboard/handlers/timeline.ts
  var MAX_TIMELINE_ENTRIES = 500;
  var TYPE_LABELS = {
    thinking: "thinking",
    tool_start: "tool start",
    tool_end: "tool end",
    hook_execution: "hook",
    agent_start: "agent start",
    agent_stop: "agent stop",
    session_start: "session",
    session_stop: "session",
    team_update: "team",
    task_update: "task",
    task_completed: "task done",
    message_sent: "message",
    teammate_idle: "idle",
    plan_update: "plan",
    plan_delete: "plan",
    plan_list: "plan",
    connection_status: "connection",
    subagent_mapping: "subagent"
  };
  var TYPE_ICONS = {
    thinking: "&#129504;",
    // brain
    tool_start: "&#128295;",
    // wrench
    tool_end: "&#128295;",
    // wrench
    hook_execution: "&#9881;",
    // gear
    agent_start: "&#129302;",
    // robot
    agent_stop: "&#129302;",
    // robot
    session_start: "&#128225;",
    // satellite
    session_stop: "&#128225;",
    // satellite
    team_update: "&#128101;",
    // people
    task_update: "&#128203;",
    // clipboard
    task_completed: "&#9989;",
    // check
    message_sent: "&#128172;",
    // speech
    teammate_idle: "&#128164;",
    // zzz
    plan_update: "&#128196;",
    // document
    plan_delete: "&#128196;",
    // document
    plan_list: "&#128196;",
    // document
    connection_status: "&#128268;",
    // plug
    subagent_mapping: "&#128279;"
    // link
  };
  var TIMELINE_CATEGORIES = {
    thinking: { label: "Thinking", types: ["thinking"], color: "var(--color-accent-blue)", icon: "&#129504;" },
    tools: { label: "Tools", types: ["tool_start", "tool_end"], color: "var(--color-accent-green)", icon: "&#128295;" },
    hooks: { label: "Hooks", types: ["hook_execution"], color: "var(--color-accent-yellow)", icon: "&#9881;" },
    agents: { label: "Agents", types: ["agent_start", "agent_stop", "session_start", "session_stop"], color: "var(--color-accent-purple)", icon: "&#129302;" },
    team: { label: "Team", types: ["team_update", "task_update", "task_completed", "message_sent", "teammate_idle"], color: "var(--color-accent-orange)", icon: "&#128101;" },
    plans: { label: "Plans", types: ["plan_update", "plan_delete"], color: "var(--color-text-muted)", icon: "&#128196;" }
  };
  var TYPE_TO_CATEGORY = {};
  for (const [cat, def] of Object.entries(TIMELINE_CATEGORIES)) {
    for (const t of def.types) {
      TYPE_TO_CATEGORY[t] = cat;
    }
  }
  var typeFilterState = /* @__PURE__ */ new Map();
  var typeCounts = /* @__PURE__ */ new Map();
  var chipElements = /* @__PURE__ */ new Map();
  var STORAGE_KEY = "tm-timeline-type-filter";
  var SESSION_STORAGE_KEY = "tm-timeline-session-filter";
  var sessionFilterState = /* @__PURE__ */ new Map();
  var sessionCounts = /* @__PURE__ */ new Map();
  var sessionChipElements = /* @__PURE__ */ new Map();
  var callbacks6 = null;
  var timelineCount = 0;
  function initTimeline(cbs) {
    callbacks6 = cbs;
    initTimelineFilter();
    initTypeChips();
    loadSessionFilterState();
  }
  function initTimelineFilter() {
    const filterInput = elements.timelineFilter;
    const clearBtn = elements.timelineFilterClear;
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        state.timelineFilter = filterInput.value.toLowerCase();
        applyTimelineFilter();
        if (clearBtn) {
          clearBtn.classList.toggle("panel-filter-hidden", !filterInput.value);
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (filterInput) {
          filterInput.value = "";
          state.timelineFilter = "";
          applyTimelineFilter();
          clearBtn.classList.add("panel-filter-hidden");
        }
      });
    }
  }
  function initTypeChips() {
    const container = elements.timelineTypeChips;
    if (!container) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [cat, enabled] of Object.entries(parsed)) {
          typeFilterState.set(cat, enabled);
        }
      }
    } catch {
    }
    for (const cat of Object.keys(TIMELINE_CATEGORIES)) {
      if (!typeFilterState.has(cat)) typeFilterState.set(cat, true);
      typeCounts.set(cat, 0);
    }
    const allDisabled = Array.from(typeFilterState.values()).every((v) => !v);
    if (allDisabled) {
      for (const cat of Object.keys(TIMELINE_CATEGORIES)) {
        typeFilterState.set(cat, true);
      }
    }
    for (const [cat, def] of Object.entries(TIMELINE_CATEGORIES)) {
      const chip = document.createElement("button");
      chip.className = "timeline-chip" + (typeFilterState.get(cat) ? " active" : "");
      chip.dataset.category = cat;
      if (typeFilterState.get(cat)) {
        chip.style.background = def.color;
      }
      chip.innerHTML = `${def.icon} ${def.label} <span class="chip-count">0</span>`;
      chip.addEventListener("click", () => {
        const current = typeFilterState.get(cat) ?? true;
        typeFilterState.set(cat, !current);
        chip.classList.toggle("active", !current);
        chip.style.background = !current ? def.color : "";
        saveTypeFilterState();
        applyTimelineFilter();
      });
      container.appendChild(chip);
      chipElements.set(cat, chip);
    }
  }
  function saveTypeFilterState() {
    try {
      const obj = {};
      for (const [cat, enabled] of typeFilterState) {
        obj[cat] = enabled;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
    }
  }
  function resetTypeChips() {
    for (const cat of Object.keys(TIMELINE_CATEGORIES)) {
      typeCounts.set(cat, 0);
      typeFilterState.set(cat, true);
      const chip = chipElements.get(cat);
      if (chip) {
        chip.classList.add("active");
        chip.style.background = TIMELINE_CATEGORIES[cat].color;
        const countEl = chip.querySelector(".chip-count");
        if (countEl) countEl.textContent = "0";
      }
    }
    saveTypeFilterState();
    resetSessionChips();
  }
  function loadSessionFilterState() {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [id, enabled] of Object.entries(parsed)) {
          sessionFilterState.set(id, enabled);
        }
      }
    } catch {
    }
  }
  function saveSessionFilterState() {
    try {
      const obj = {};
      for (const [id, enabled] of sessionFilterState) {
        obj[id] = enabled;
      }
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(obj));
    } catch {
    }
  }
  function addOrUpdateSessionChip(sessionId) {
    const container = elements.timelineSessionChips;
    if (!container) return;
    if (sessionChipElements.has(sessionId)) {
      const chip2 = sessionChipElements.get(sessionId);
      const session2 = state.sessions.get(sessionId);
      const newLabel = getSessionDisplayName(session2?.workingDirectory, sessionId);
      const color2 = session2?.color || "var(--color-text-muted)";
      const countEl = chip2.querySelector(".chip-count");
      const currentCount = String(sessionCounts.get(sessionId) || 0);
      if (countEl) {
        countEl.textContent = currentCount;
        chip2.childNodes[0].textContent = newLabel + " ";
      }
      const isActive2 = sessionFilterState.get(sessionId) ?? false;
      if (isActive2) {
        chip2.style.background = color2;
      }
      chip2.title = `Session: ${sessionId}`;
      return;
    }
    if (!sessionFilterState.has(sessionId)) {
      sessionFilterState.set(sessionId, false);
    }
    const session = state.sessions.get(sessionId);
    const label = getSessionDisplayName(session?.workingDirectory, sessionId);
    const color = session?.color || "var(--color-text-muted)";
    const isActive = sessionFilterState.get(sessionId) ?? false;
    const chip = document.createElement("button");
    chip.className = "timeline-chip timeline-session-chip" + (isActive ? " active" : "");
    chip.dataset.sessionId = sessionId;
    if (isActive) {
      chip.style.background = color;
    }
    chip.title = `Session: ${sessionId}`;
    chip.innerHTML = `${escapeHtml(label)} <span class="chip-count">${sessionCounts.get(sessionId) || 0}</span>`;
    chip.addEventListener("click", () => {
      const current = sessionFilterState.get(sessionId) ?? false;
      sessionFilterState.set(sessionId, !current);
      chip.classList.toggle("active", !current);
      chip.style.background = !current ? color : "";
      saveSessionFilterState();
      applyTimelineFilter();
    });
    container.appendChild(chip);
    sessionChipElements.set(sessionId, chip);
  }
  function resetSessionChips() {
    sessionFilterState.clear();
    sessionCounts.clear();
    sessionChipElements.clear();
    const container = elements.timelineSessionChips;
    if (container) container.innerHTML = "";
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
    }
  }
  function refreshSessionChips() {
    for (const sessionId of state.sessions.keys()) {
      if (!sessionChipElements.has(sessionId)) {
        addOrUpdateSessionChip(sessionId);
      }
    }
  }
  function applyTimelineFilter() {
    const container = elements.timelineEntries;
    if (!container) return;
    const filter = state.timelineFilter;
    let visible = 0;
    for (const child of Array.from(container.children)) {
      const el = child;
      if (!el.dataset.filterText) continue;
      const matchesText = !filter || el.dataset.filterText.includes(filter);
      const elCategory = el.dataset.category || "";
      const matchesType = !elCategory || typeFilterState.get(elCategory) !== false;
      const anySessionChipActive = Array.from(sessionFilterState.values()).some((v) => v);
      let matchesSession;
      if (anySessionChipActive) {
        matchesSession = !el.dataset.session || sessionFilterState.get(el.dataset.session) === true;
      } else {
        matchesSession = state.selectedSession === "all" || !el.dataset.session || el.dataset.session === state.selectedSession;
      }
      if (matchesText && matchesType && matchesSession) {
        el.style.display = "";
        visible++;
      } else {
        el.style.display = "none";
      }
    }
    if (elements.timelineCount) {
      const anyTypeDisabled = Array.from(typeFilterState.values()).some((v) => !v);
      const anySessionChipEnabled = Array.from(sessionFilterState.values()).some((v) => v);
      const hasActiveFilter = !!filter || anyTypeDisabled || anySessionChipEnabled || state.selectedSession !== "all";
      elements.timelineCount.textContent = hasActiveFilter ? `${visible}/${timelineCount}` : String(timelineCount);
      if (anySessionChipEnabled) {
        elements.timelineCount.title = "Filtered by session chips (overrides dropdown)";
      } else {
        elements.timelineCount.title = "";
      }
    }
  }
  function getEventSummary(event) {
    switch (event.type) {
      case "thinking":
        return event.content.slice(0, 60).replace(/\n/g, " ") + (event.content.length > 60 ? "..." : "");
      case "tool_start": {
        const inputPreview = summarizeInput(event.input, event.toolName);
        return `${shortenToolName(event.toolName)} started` + (inputPreview ? ": " + inputPreview : "");
      }
      case "tool_end":
        return `${shortenToolName(event.toolName)} completed` + (event.durationMs ? ` (${event.durationMs}ms)` : "");
      case "hook_execution":
        return `${event.hookType}` + (event.toolName ? ` \u2192 ${shortenToolName(event.toolName)}` : "") + (event.decision ? ` [${event.decision}]` : "");
      case "agent_start":
        return `Agent started: ${event.agentName || event.agentId}`;
      case "agent_stop":
        return `Agent stopped: ${event.agentId} (${event.status || "unknown"})`;
      case "session_start":
        return `Session started` + (event.workingDirectory ? `: ${event.workingDirectory}` : "");
      case "session_stop":
        return `Session stopped`;
      case "team_update":
        return `Team ${event.teamName}: ${event.members.length} members`;
      case "task_update":
        return `Tasks updated: ${event.tasks.length} tasks`;
      case "task_completed":
        return `Task completed: ${event.taskSubject}`;
      case "message_sent":
        return `${event.sender} \u2192 ${event.recipient}: ${event.summary || ""}`;
      case "teammate_idle":
        return `${event.teammateName} went idle`;
      case "plan_update":
        return `Plan updated: ${event.filename}`;
      case "plan_delete":
        return `Plan deleted: ${event.filename}`;
      case "plan_list":
        return `${event.plans.length} plan(s) available`;
      case "connection_status":
        return `Server ${event.status} (v${event.serverVersion})`;
      case "subagent_mapping":
        return `${event.mappings.length} subagent mapping(s)`;
      default:
        return "Unknown event";
    }
  }
  function addTimelineEntry(event) {
    if (!callbacks6) return;
    const entriesContainer = elements.timelineEntries;
    if (!entriesContainer) return;
    if (event.type === "connection_status" || event.type === "subagent_mapping" || event.type === "plan_list") {
      return;
    }
    const emptyState2 = entriesContainer.querySelector(".empty-state");
    if (emptyState2) {
      emptyState2.remove();
    }
    timelineCount++;
    const category = TYPE_TO_CATEGORY[event.type] || "";
    if (category) {
      typeCounts.set(category, (typeCounts.get(category) || 0) + 1);
      const chip = chipElements.get(category);
      if (chip) {
        const countEl = chip.querySelector(".chip-count");
        if (countEl) countEl.textContent = String(typeCounts.get(category));
      }
    }
    let resolvedSessionId = event.sessionId;
    if (!resolvedSessionId) {
      if (event.type === "plan_update" || event.type === "plan_delete") {
        const planPath = event.path;
        if (planPath) {
          for (const [sessId, assocPath] of state.sessionPlanMap) {
            if (assocPath === planPath || assocPath.endsWith(planPath)) {
              resolvedSessionId = sessId;
              break;
            }
          }
        }
      } else if (event.type === "team_update" || event.type === "task_update") {
        const teamName = event.teamName || event.teamId;
        if (teamName) {
          resolvedSessionId = teamState.teamSessionMap.get(teamName);
        }
      }
    }
    if (resolvedSessionId) {
      sessionCounts.set(resolvedSessionId, (sessionCounts.get(resolvedSessionId) || 0) + 1);
      addOrUpdateSessionChip(resolvedSessionId);
    }
    if (elements.timelineCount) {
      elements.timelineCount.textContent = String(timelineCount);
    }
    const time = formatTime(event.timestamp);
    const icon = TYPE_ICONS[event.type] || "&#9679;";
    const summary = getEventSummary(event);
    const agentId = event.agentId || "main";
    let agentLabel;
    let agentTooltip;
    if (agentId === "main") {
      const session = state.sessions.get(resolvedSessionId || "");
      agentLabel = getSessionDisplayName(session?.workingDirectory, resolvedSessionId);
      agentTooltip = session?.workingDirectory ? `${session.workingDirectory}
Session: ${resolvedSessionId || ""}` : `Session: ${resolvedSessionId || ""}`;
    } else {
      const subagent = subagentState.subagents.get(agentId);
      agentLabel = subagent?.agentName || (agentId.length > 12 ? agentId.slice(0, 12) + "..." : agentId);
      agentTooltip = `Agent: ${subagent?.agentName || agentId}
Status: ${subagent?.status || "unknown"}
Session: ${resolvedSessionId || ""}`;
    }
    const agentBadgeColors = getAgentBadgeColors(agentId === "main" ? agentLabel : agentId);
    const typeClass = event.type.replace(/_/g, "-");
    const typeLabel = TYPE_LABELS[event.type] || event.type.replace(/_/g, " ");
    const typeFull = event.type.replace(/_/g, " ");
    const filterText = `${typeFull} ${summary} ${agentLabel}`.toLowerCase();
    const entry = document.createElement("div");
    entry.className = `timeline-entry timeline-${typeClass} new`;
    entry.dataset.timestamp = String(Date.now());
    entry.dataset.type = event.type;
    entry.dataset.session = resolvedSessionId || "";
    entry.dataset.filterText = filterText;
    entry.dataset.category = category;
    if (event.type === "thinking") {
      entry.dataset.sourceTimestamp = event.timestamp;
      entry.style.cursor = "pointer";
    }
    entry.innerHTML = `
    <span class="timeline-icon">${icon}</span>
    <span class="timeline-time">${escapeHtml(time)}</span>
    <span class="timeline-type" title="${escapeHtml(typeFull)}">${escapeHtml(typeLabel)}</span>
    <span class="timeline-summary">${escapeHtml(summary)}</span>
    <span class="timeline-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}" title="${escapeHtml(agentTooltip)}">${escapeHtml(agentLabel)}</span>
  `;
    if (event.type === "thinking") {
      entry.addEventListener("click", () => {
        navigateToThinkingEntry(event.timestamp);
      });
    }
    if (state.selectedSession !== "all" && resolvedSessionId && resolvedSessionId !== state.selectedSession) {
      entry.style.display = "none";
    }
    if (state.timelineFilter && !filterText.includes(state.timelineFilter)) {
      entry.style.display = "none";
    }
    if (category && typeFilterState.get(category) === false) {
      entry.style.display = "none";
    }
    const children = entriesContainer.children;
    while (children.length >= MAX_TIMELINE_ENTRIES) {
      let removed = false;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.dataset.type !== "thinking") {
          child.remove();
          removed = true;
          break;
        }
      }
      if (!removed) {
        children[0].remove();
      }
    }
    entriesContainer.appendChild(entry);
    callbacks6.smartScroll(entriesContainer);
    setTimeout(() => entry.classList.remove("new"), 1e3);
  }
  function navigateToThinkingEntry(eventTimestamp) {
    selectView("thinking");
    const thinkingContent = elements.thinkingContent;
    if (!thinkingContent) return;
    requestAnimationFrame(() => {
      const entries = Array.from(thinkingContent.querySelectorAll(".thinking-entry"));
      for (const entry of entries) {
        const el = entry;
        if (el.dataset.eventTimestamp === eventTimestamp) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("highlight-flash");
          setTimeout(() => el.classList.remove("highlight-flash"), 2e3);
          return;
        }
      }
    });
  }

  // src/dashboard/handlers/sessions.ts
  var ACTIVITY_THRESHOLD_MS = 1e4;
  var ACTIVITY_CHECK_INTERVAL_MS = 5e3;
  var activityCheckerInterval = null;
  var durationInterval = null;
  var callbacks7 = null;
  function initSessions(cbs) {
    callbacks7 = cbs;
    startActivityChecker();
    startDurationTimer();
  }
  function getSessionDisplayName(workingDirectory, sessionId) {
    if (workingDirectory) {
      const parts = workingDirectory.replace(/\/$/, "").split("/");
      const folderName = parts[parts.length - 1];
      if (folderName) {
        return folderName;
      }
    }
    return sessionId?.slice(0, 8) || "unknown";
  }
  function getSessionFolderName(workingDirectory) {
    if (workingDirectory) {
      const parts = workingDirectory.replace(/\/$/, "").split("/");
      return parts[parts.length - 1] || void 0;
    }
    return void 0;
  }
  function updateSessionActivity(sessionId) {
    const session = state.sessions.get(sessionId);
    if (session) {
      session.lastActivityTime = Date.now();
      updateStatusBarSession();
    }
  }
  function hasRecentActivity(sessionId) {
    const session = state.sessions.get(sessionId);
    if (!session || !session.lastActivityTime) {
      return false;
    }
    return Date.now() - session.lastActivityTime < ACTIVITY_THRESHOLD_MS;
  }
  function startActivityChecker() {
    if (activityCheckerInterval) {
      return;
    }
    activityCheckerInterval = setInterval(() => {
      if (state.sessions.size > 0) {
        updateSessionFilter();
        updateStatusBarSession();
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }
  function startDurationTimer() {
    if (durationInterval) return;
    durationInterval = setInterval(() => {
      updateStatusBarSession();
    }, 6e4);
  }
  function trackSession(sessionId, timestamp) {
    if (!sessionId) return;
    const isNewSession = !state.sessions.has(sessionId);
    if (isNewSession) {
      state.sessions.set(sessionId, {
        id: sessionId,
        startTime: timestamp,
        active: true,
        color: getSessionColorByFolder("", sessionId),
        lastActivityTime: Date.now()
      });
      debug(`[Dashboard] New session tracked: ${sessionId}`);
      updateSessionFilter();
      refreshSessionChips();
    }
    state.currentSessionId = sessionId;
  }
  function handleSessionStart(event) {
    const sessionId = event.sessionId;
    const workingDirectory = event.workingDirectory;
    const folderName = getSessionFolderName(workingDirectory);
    debug(`[Dashboard] Session started: ${sessionId}`, { workingDirectory, folderName });
    state.sessions.set(sessionId, {
      id: sessionId,
      workingDirectory,
      startTime: event.timestamp,
      active: true,
      color: getSessionColorByFolder(folderName || "", sessionId),
      lastActivityTime: Date.now()
    });
    state.currentSessionId = sessionId;
    updateSessionFilter();
    if (state.selectedSession === "all") {
      updateSessionPanelVisibility("all");
    }
  }
  function handleSessionStop(event) {
    const sessionId = event.sessionId;
    const session = state.sessions.get(sessionId);
    debug(`[Dashboard] Session stopped: ${sessionId}`);
    if (session) {
      session.active = false;
      session.endTime = event.timestamp;
    }
    if (state.currentSessionId === sessionId) {
      state.currentSessionId = null;
    }
    updateSessionFilter();
  }
  function updateSessionFilter() {
    let filterEl = elements.sessionFilter;
    if (!filterEl) {
      const existingEl = document.getElementById("session-filter");
      if (existingEl) {
        elements.sessionFilter = existingEl;
        filterEl = existingEl;
      } else {
        filterEl = document.createElement("div");
        filterEl.id = "session-filter";
        filterEl.className = "session-filter";
        const viewTabs = elements.viewTabs || document.querySelector(".header");
        if (viewTabs && viewTabs.parentNode) {
          viewTabs.parentNode.insertBefore(filterEl, viewTabs.nextSibling);
        }
        elements.sessionFilter = filterEl;
      }
    }
    if (state.sessions.size === 0) {
      filterEl.style.display = "none";
      return;
    }
    filterEl.style.display = "flex";
    let html = '<span class="session-filter-label">SESSION:</span>';
    html += `<button class="session-filter-clear-btn" title="Clear all panels" aria-label="Clear all panels">&#10005;</button>`;
    html += '<select class="session-dropdown" id="session-dropdown" aria-label="Select session">';
    html += `<option value="all"${state.selectedSession === "all" ? " selected" : ""}>All Sessions (${state.sessions.size})</option>`;
    const sortedSessions = Array.from(state.sessions.entries()).sort((a, b) => {
      const folderA = getSessionDisplayName(a[1].workingDirectory, a[0]);
      const folderB = getSessionDisplayName(b[1].workingDirectory, b[0]);
      return folderA.localeCompare(folderB);
    });
    const displayNameCounts = /* @__PURE__ */ new Map();
    for (const [sessionId, session] of sortedSessions) {
      const displayName = getSessionDisplayName(session.workingDirectory, sessionId);
      displayNameCounts.set(displayName, (displayNameCounts.get(displayName) || 0) + 1);
    }
    for (const [sessionId, session] of sortedSessions) {
      const displayName = getSessionDisplayName(session.workingDirectory, sessionId);
      const statusIndicator = session.active ? hasRecentActivity(sessionId) ? "\u25CF" : "\u25CB" : "\u25CC";
      const selected = state.selectedSession === sessionId ? " selected" : "";
      const subagentIds = subagentState.sessionSubagents.get(sessionId);
      const subagentCount = subagentIds?.size || 0;
      const subagentLabel = subagentCount > 0 ? ` [${subagentCount} agents]` : "";
      let disambiguated = displayName;
      if ((displayNameCounts.get(displayName) || 0) > 1) {
        let timeStr = "";
        if (session.startTime) {
          const d = new Date(session.startTime);
          timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
        disambiguated = `${displayName} (${timeStr || sessionId.slice(0, 8)})`;
      }
      html += `<option value="${escapeHtml(sessionId)}"${selected}>${statusIndicator} ${escapeHtml(disambiguated)}${subagentLabel}</option>`;
    }
    html += "</select>";
    if (state.selectedSession !== "all") {
      const subagentIds = subagentState.sessionSubagents.get(state.selectedSession);
      if (subagentIds && subagentIds.size > 0) {
        html += '<div class="session-agent-chips">';
        for (const agentId of subagentIds) {
          const subagent = subagentState.subagents.get(agentId);
          if (!subagent) continue;
          const subagentName = subagent.agentName || agentId.slice(0, 8);
          const agentColor = getAgentColor(subagentName);
          const isRunning = subagent.status === "running";
          const isSelected = state.selectedAgentId === agentId;
          html += `<button class="session-agent-chip${isRunning ? " running" : ""}${isSelected ? " active" : ""}" data-agent="${escapeHtml(agentId)}" title="${escapeHtml(subagentName)} (${escapeHtml(subagent.status)})">
          <span class="session-agent-chip-dot" style="background: ${agentColor}"></span>
          ${escapeHtml(subagentName)}
        </button>`;
        }
        html += "</div>";
      }
    }
    filterEl.innerHTML = html;
    const clearBtn = filterEl.querySelector(".session-filter-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (callbacks7) callbacks7.clearAllPanels();
      });
    }
    const dropdown = filterEl.querySelector(".session-dropdown");
    if (dropdown) {
      dropdown.addEventListener("change", () => {
        selectSession(dropdown.value);
      });
    }
    filterEl.querySelectorAll(".session-agent-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const agentId = chip.dataset.agent;
        if (agentId) {
          if (state.selectedAgentId === agentId) {
            selectAgentFilter(null);
          } else {
            selectAgentFilter(agentId);
          }
        }
      });
    });
  }
  function updateSessionPanelVisibility(sessionId) {
    const isAllSessions = sessionId === "all";
    if (elements.planPanel) {
      elements.planPanel.classList.toggle("session-hidden", isAllSessions);
    }
    if (elements.teamPanel) {
      elements.teamPanel.classList.toggle("session-hidden", isAllSessions);
    }
    if (elements.tasksPanel) {
      elements.tasksPanel.classList.toggle("session-hidden", isAllSessions);
    }
    rebuildResizers();
  }
  function selectSession(sessionId) {
    state.selectedSession = sessionId;
    const isAllSessions = sessionId === "all";
    updateSessionFilter();
    filterAllBySession();
    updateSessionPanelVisibility(sessionId);
    updateSessionViewTabs(isAllSessions);
    if (sessionId === "all") {
    } else {
      const associatedPlanPath = state.sessionPlanMap.get(sessionId);
      if (associatedPlanPath) {
        if (callbacks7) {
          callbacks7.displayPlan(associatedPlanPath);
        }
      } else {
        if (callbacks7) {
          callbacks7.displaySessionPlanEmpty(sessionId);
        }
      }
    }
    if (callbacks7) {
      callbacks7.setStatsSource(sessionId);
    }
    filterTeamBySession();
    filterTasksBySession();
    if (callbacks7) {
      callbacks7.updateExportButtonState();
    }
  }
  function selectAgentFilter(agentId) {
    state.selectedAgentId = agentId;
    filterAllBySession();
    debug(`[Dashboard] Agent filter: ${agentId || "all"}`);
  }
  var contextMenuSessionId = null;
  function hideSessionContextMenu() {
    const menu = elements.sessionContextMenu;
    if (menu) {
      menu.classList.remove("visible");
    }
    contextMenuSessionId = null;
  }
  function handleRevealSessionInFinder() {
    if (!contextMenuSessionId) return;
    const session = state.sessions.get(contextMenuSessionId);
    if (!session?.workingDirectory) return;
    const path = session.workingDirectory;
    debug(`[Dashboard] Reveal in Finder: ${path}`);
    fetch("http://localhost:3355/file-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reveal", path })
    }).then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        console.error("[Dashboard] Reveal in Finder failed:", response.status, text);
        if (callbacks7) {
          callbacks7.showToast(`Path: ${path}`, "info", 5e3);
        }
      } else {
        debug("[Dashboard] Reveal in Finder succeeded");
      }
    }).catch((err) => {
      console.error("[Dashboard] Reveal in Finder fetch error:", err);
      if (callbacks7) {
        callbacks7.showToast(`Path: ${path}`, "info", 5e3);
      }
    });
    hideSessionContextMenu();
  }
  function findMostRecentActiveSession() {
    let mostRecent = null;
    let mostRecentTime = 0;
    for (const [id, session] of state.sessions) {
      if (session.lastActivityTime && session.lastActivityTime > mostRecentTime) {
        mostRecentTime = session.lastActivityTime;
        mostRecent = { id, session };
      }
    }
    return mostRecent;
  }
  function updateStatusBarSession() {
    const indicator = elements.activeSessionIndicator;
    if (!indicator) return;
    const mostRecent = findMostRecentActiveSession();
    if (!mostRecent) {
      indicator.innerHTML = "";
      indicator.style.display = "none";
      return;
    }
    const { id, session } = mostRecent;
    const folderName = getSessionDisplayName(session.workingDirectory, id);
    const isActive = hasRecentActivity(id);
    const tooltipText = session.workingDirectory ? `${session.workingDirectory}
Session: ${id}` : `Session: ${id}`;
    const elapsed = session.startTime ? formatElapsed(Date.now() - new Date(session.startTime).getTime()) : "";
    indicator.style.display = "flex";
    indicator.innerHTML = `
    <span class="active-session-dot${isActive ? " pulsing" : ""}" style="background: ${escapeCssValue(session.color)}"></span>
    <span class="active-session-name" title="${escapeHtml(tooltipText)}">${escapeHtml(folderName)}</span>
    ${elapsed ? `<span class="active-session-duration">${escapeHtml(elapsed)}</span>` : ""}
  `;
    indicator.dataset.sessionId = id;
  }
  function initStatusBarSession() {
    const indicator = elements.activeSessionIndicator;
    if (!indicator) return;
    indicator.addEventListener("click", () => {
      const sessionId = indicator.dataset.sessionId;
      if (sessionId) {
        selectSession(sessionId);
      }
    });
  }

  // src/dashboard/handlers/hooks.ts
  var callbacks8 = null;
  var hooksFilter = "all";
  function initHooks(cbs) {
    callbacks8 = cbs;
    elements.hooksFilter?.addEventListener("change", (e) => {
      hooksFilter = e.target.value;
      filterAllHooks();
      updateHooksCount();
    });
  }
  function getDecisionClass(decision) {
    switch (decision) {
      case "allow":
        return "hook-decision-allow";
      case "deny":
        return "hook-decision-deny";
      case "ask":
        return "hook-decision-ask";
      default:
        return "";
    }
  }
  function getHookTypeClass(hookType) {
    switch (hookType) {
      case "PreToolUse":
        return "hook-type-pre";
      case "PostToolUse":
        return "hook-type-post";
      case "Stop":
        return "hook-type-stop";
      case "UserPromptSubmit":
        return "hook-type-prompt";
      case "SubagentStart":
      case "SubagentStop":
        return "hook-type-subagent";
      case "TeammateIdle":
        return "hook-type-teammate";
      case "TaskCompleted":
        return "hook-type-task";
      default:
        return "";
    }
  }
  function applyHooksFilter(entry) {
    const hookType = entry.dataset.hookType || "";
    const decision = entry.dataset.decision || "";
    const entrySession = entry.dataset.session || "";
    const matchesSession = state.selectedSession === "all" || entrySession === state.selectedSession;
    let matchesHookFilter = true;
    switch (hooksFilter) {
      case "allow":
        matchesHookFilter = decision === "allow";
        break;
      case "deny":
        matchesHookFilter = decision === "deny";
        break;
      case "pre":
        matchesHookFilter = hookType === "pretooluse";
        break;
      case "post":
        matchesHookFilter = hookType === "posttooluse";
        break;
      case "subagent":
        matchesHookFilter = hookType.startsWith("subagent");
        break;
      case "deny-subagent":
        matchesHookFilter = decision === "deny" || hookType.startsWith("subagent");
        break;
      case "teammate":
        matchesHookFilter = hookType === "teammateidle";
        break;
      case "task":
        matchesHookFilter = hookType === "taskcompleted";
        break;
      case "team-all":
        matchesHookFilter = hookType === "teammateidle" || hookType === "taskcompleted";
        break;
      default:
        matchesHookFilter = true;
    }
    entry.style.display = matchesSession && matchesHookFilter ? "" : "none";
  }
  function filterAllHooks() {
    if (!elements.hooksContent) return;
    const existingFilterEmpty = elements.hooksContent.querySelector(".filter-empty");
    if (existingFilterEmpty) existingFilterEmpty.remove();
    const entries = elements.hooksContent.querySelectorAll(".hook-entry");
    let visibleCount = 0;
    entries.forEach((entry) => {
      applyHooksFilter(entry);
      if (entry.style.display !== "none") visibleCount++;
    });
    if (visibleCount === 0 && entries.length > 0 && hooksFilter !== "all") {
      const emptyEl = document.createElement("div");
      emptyEl.className = "empty-state filter-empty";
      emptyEl.innerHTML = `
      <div class="empty-state-icon">&#9881;</div>
      <p class="empty-state-title">No matching hook events</p>
      <p class="empty-state-subtitle">Try changing the filter above</p>
    `;
      elements.hooksContent.appendChild(emptyEl);
    }
  }
  function updateHooksCount() {
    if (!elements.hooksCount) return;
    const hasFilter = hooksFilter !== "all" || state.selectedSession !== "all";
    if (!hasFilter) {
      elements.hooksCount.textContent = String(state.hooksCount);
    } else {
      const visibleCount = elements.hooksContent ? elements.hooksContent.querySelectorAll('.hook-entry:not([style*="display: none"])').length : 0;
      elements.hooksCount.textContent = `${visibleCount}/${state.hooksCount}`;
    }
    updateTabBadge("hooks", state.hooksCount);
  }
  function handleHookExecution(event) {
    if (!callbacks8) {
      console.error("[Hooks] Handler not initialized - call initHooks first");
      return;
    }
    const hookType = event.hookType;
    const toolName = event.toolName;
    const toolCallId = event.toolCallId;
    const decision = event.decision;
    const hookName = event.hookName;
    const output = event.output;
    const time = formatTime(event.timestamp);
    const sessionId = event.sessionId;
    const agentId = event.agentId;
    if (hookType === "PostToolUse" && toolCallId) {
      const existingEntry = elements.hooksContent?.querySelector(
        `.hook-entry[data-hook-call-id="${CSS.escape(toolCallId)}"]`
      );
      if (existingEntry) {
        const typeEl = existingEntry.querySelector(".hook-type");
        if (typeEl) {
          typeEl.textContent = "Pre\u2192Post";
          typeEl.className = "hook-type hook-type-grouped";
        }
        const headerEl = existingEntry.querySelector(".hook-entry-header");
        if (headerEl && !headerEl.querySelector(".hook-decision-observed")) {
          const observedBadge = document.createElement("span");
          observedBadge.className = "hook-decision hook-decision-observed";
          observedBadge.textContent = "observed";
          headerEl.appendChild(observedBadge);
        }
        existingEntry.classList.add("new");
        setTimeout(() => existingEntry.classList.remove("new"), 1e3);
        return;
      }
    }
    state.hooksCount++;
    updateHooksCount();
    const emptyState2 = elements.hooksContent?.querySelector(".empty-state");
    if (emptyState2) {
      emptyState2.remove();
    }
    let decisionBadge = "";
    if (decision) {
      decisionBadge = `<span class="hook-decision ${getDecisionClass(decision)}">${escapeHtml(decision)}</span>`;
    } else if (hookType === "PostToolUse") {
      decisionBadge = `<span class="hook-decision hook-decision-observed">observed</span>`;
    }
    let toolInfo = "";
    if (hookType === "SubagentStart" || hookType === "SubagentStop") {
      let agentType = "";
      if (agentId) {
        const subagentMapping = subagentState.subagents.get(agentId);
        if (subagentMapping?.agentName) {
          agentType = subagentMapping.agentName;
        }
      }
      if (!agentType && output) {
        agentType = output.split(":")[0]?.trim() || "";
      }
      const isRealAgentType = agentType && !/^[0-9a-f]{7,}$/i.test(agentType);
      if (isRealAgentType) {
        const badgeColors = getAgentBadgeColors(agentType);
        toolInfo = `<span class="hook-tool hook-agent-type" style="background: ${escapeCssValue(badgeColors.bg)}; color: ${escapeCssValue(badgeColors.text)};">${escapeHtml(agentType)}</span>`;
      }
    } else if (toolName) {
      toolInfo = `<span class="hook-tool" title="${escapeHtml(toolName)}">${escapeHtml(shortenToolName(toolName))}</span>`;
    }
    const outputPreview = output ? `<div class="hook-output">${escapeHtml(output.length > 100 ? output.slice(0, 100) + "..." : output)}</div>` : "";
    const session = state.sessions.get(sessionId || "");
    const folderName = session?.workingDirectory ? getSessionDisplayName(session.workingDirectory) : null;
    const folderBadge = sessionId && folderName ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(folderName)}</span>` : "";
    const sessionBadge = sessionId && !folderName ? `<span class="hook-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>` : "";
    const isSubagentHook = hookType === "SubagentStart" || hookType === "SubagentStop";
    let agentBadge = "";
    if (agentId && agentId !== sessionId && !isSubagentHook) {
      const agentBadgeColors = getAgentBadgeColors(agentId);
      agentBadge = `<span class="hook-agent-badge" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(getShortSessionId(agentId))}</span>`;
    }
    const asyncBadge = event.async ? `<span class="hook-async-badge" title="Async hook">async</span>` : "";
    let execTypeBadge = "";
    if (event.hookExecType) {
      const execTypeClass = `hook-exec-${event.hookExecType}`;
      execTypeBadge = `<span class="hook-exec-type ${execTypeClass}">${escapeHtml(event.hookExecType)}</span>`;
    }
    const isOurHook = hookName === "thinking-monitor-hook";
    const contentSection = isSubagentHook || isOurHook ? "" : `<div class="hook-entry-content">
        <span class="hook-name">${escapeHtml(hookName)}</span>
        ${asyncBadge}
        ${execTypeBadge}
        ${outputPreview}
      </div>`;
    const entry = document.createElement("div");
    entry.className = "hook-entry";
    entry.dataset.hookType = hookType.toLowerCase();
    entry.dataset.session = sessionId || "";
    entry.dataset.decision = decision?.toLowerCase() || "";
    entry.dataset.timestamp = String(Date.now());
    if (toolCallId) {
      entry.dataset.hookCallId = toolCallId;
    }
    entry.innerHTML = `
    <div class="hook-entry-header">
      <span class="hook-time">${escapeHtml(time)}</span>
      <span class="hook-type ${getHookTypeClass(hookType)}">${escapeHtml(hookType)}</span>
      ${toolInfo}
      ${folderBadge}
      ${sessionBadge}
      ${agentBadge}
      <span class="hook-header-spacer"></span>
      ${decisionBadge}
    </div>
    ${contentSection}
  `;
    if (elements.hooksContent) {
      applyHooksFilter(entry);
      callbacks8.appendAndTrim(elements.hooksContent, entry);
      callbacks8.smartScroll(elements.hooksContent);
    }
    const toolEl = entry.querySelector(".hook-tool");
    if (toolEl && toolName && !isSubagentHook) {
      toolEl.style.cursor = "pointer";
      toolEl.title = "Click to find in Tools panel";
      toolEl.addEventListener("click", (e) => {
        e.stopPropagation();
        selectView("tools");
        setTimeout(() => {
          const toolEntries = document.querySelectorAll(
            `#tools-content .tool-entry[data-tool-name="${CSS.escape(toolName.toLowerCase())}"]`
          );
          const lastEntry = toolEntries[toolEntries.length - 1];
          if (lastEntry) {
            lastEntry.scrollIntoView({ behavior: "smooth", block: "center" });
            lastEntry.classList.add("flash");
            setTimeout(() => lastEntry.classList.remove("flash"), 1500);
          }
        }, 100);
      });
    }
    entry.classList.add("new");
    setTimeout(() => entry.classList.remove("new"), 1e3);
  }

  // src/dashboard/ui/filters.ts
  function filterAllBySession() {
    const thinkingEntries = elements.thinkingContent.querySelectorAll(".thinking-entry");
    thinkingEntries.forEach((entry) => {
      const el = entry;
      applySessionFilter(el);
    });
    const toolEntries = elements.toolsContent.querySelectorAll(".tool-entry");
    toolEntries.forEach((entry) => {
      const el = entry;
      applySessionFilter(el);
    });
    filterAllHooks();
    updateThinkingCount();
    updateToolsCount();
    updateHooksCount();
  }
  function matchesAgentFilter(entry) {
    if (!state.selectedAgentId) return true;
    const entryAgent = entry.dataset.agent || "";
    return entryAgent === state.selectedAgentId;
  }
  function applySessionFilter(entry) {
    const entrySession = entry.dataset.session || "";
    const parentSession = entry.dataset.parentSession || "";
    let matchesSession = false;
    if (state.selectedSession === "all") {
      matchesSession = true;
    } else if (entrySession === state.selectedSession) {
      matchesSession = true;
    } else if (parentSession === state.selectedSession) {
      matchesSession = true;
    } else {
      const agentId = entry.dataset.agent;
      if (agentId) {
        const subagent = subagentState.subagents.get(agentId);
        if (subagent && subagent.parentSessionId === state.selectedSession) {
          matchesSession = true;
        }
      }
    }
    const matchesAgent = matchesAgentFilter(entry);
    const isThinkingEntry = entry.classList.contains("thinking-entry");
    if (isThinkingEntry) {
      const matchesText = !state.thinkingFilter || (entry.dataset.content || "").includes(state.thinkingFilter.toLowerCase());
      entry.style.display = matchesSession && matchesAgent && matchesText ? "" : "none";
    } else {
      const toolName = entry.dataset.toolName || "";
      const input = entry.dataset.input || "";
      const filter = state.toolsFilter.toLowerCase();
      const matchesText = !filter || toolName.includes(filter) || input.includes(filter);
      entry.style.display = matchesSession && matchesAgent && matchesText ? "" : "none";
    }
  }
  function getShortSessionId(sessionId) {
    if (!sessionId) return "";
    return sessionId.slice(0, 8);
  }
  function applyThinkingFilter(entry) {
    const content = entry.dataset.content || "";
    const matchesText = !state.thinkingFilter || content.includes(state.thinkingFilter.toLowerCase());
    let sessionMatches = false;
    if (state.selectedSession === "all") {
      sessionMatches = true;
    } else if (entry.dataset.session === state.selectedSession) {
      sessionMatches = true;
    } else if (entry.dataset.parentSession === state.selectedSession) {
      sessionMatches = true;
    } else {
      const agentId = entry.dataset.agent;
      if (agentId) {
        const subagent = subagentState.subagents.get(agentId);
        if (subagent && subagent.parentSessionId === state.selectedSession) {
          sessionMatches = true;
        }
      }
    }
    entry.style.display = matchesText && sessionMatches ? "" : "none";
  }
  function applyToolsFilter(entry) {
    const toolName = entry.dataset.toolName || "";
    const input = entry.dataset.input || "";
    const filter = state.toolsFilter.toLowerCase();
    const matchesText = !filter || toolName.includes(filter) || input.includes(filter);
    const sessionMatches = state.selectedSession === "all" || entry.dataset.session === state.selectedSession;
    entry.style.display = matchesText && sessionMatches ? "" : "none";
  }
  function filterAllThinking() {
    const entries = elements.thinkingContent.querySelectorAll(".thinking-entry");
    entries.forEach((entry) => {
      applyThinkingFilter(entry);
    });
    if (state.thinkingFilter) {
      elements.thinkingFilterClear.classList.remove("panel-filter-hidden");
    } else {
      elements.thinkingFilterClear.classList.add("panel-filter-hidden");
    }
    updateThinkingCount();
  }
  function filterAllTools() {
    const entries = elements.toolsContent.querySelectorAll(".tool-entry");
    entries.forEach((entry) => {
      applyToolsFilter(entry);
    });
    if (state.toolsFilter) {
      elements.toolsFilterClear.classList.remove("panel-filter-hidden");
    } else {
      elements.toolsFilterClear.classList.add("panel-filter-hidden");
    }
    updateToolsCount();
  }
  function updateThinkingCount() {
    const hasFilter = state.thinkingFilter || state.selectedSession !== "all";
    if (hasFilter) {
      const entries = elements.thinkingContent.querySelectorAll(".thinking-entry");
      let visibleCount = 0;
      entries.forEach((entry) => {
        const el = entry;
        if (el.style.display !== "none") {
          visibleCount++;
        }
      });
      elements.thinkingCount.textContent = `${visibleCount}/${state.thinkingCount}`;
    } else {
      elements.thinkingCount.textContent = String(state.thinkingCount);
    }
  }
  function updateToolsCount() {
    const hasFilter = state.toolsFilter || state.selectedSession !== "all";
    if (hasFilter) {
      const entries = elements.toolsContent.querySelectorAll(".tool-entry");
      let visibleCount = 0;
      entries.forEach((entry) => {
        const el = entry;
        if (el.style.display !== "none") {
          visibleCount++;
        }
      });
      elements.toolsCount.textContent = `${visibleCount}/${state.toolsCount}`;
    } else {
      elements.toolsCount.textContent = String(state.toolsCount);
    }
  }

  // src/dashboard/ui/search-overlay.ts
  var isOpen = false;
  var overlayEl = null;
  var searchInput = null;
  var resultsContainer = null;
  var debounceTimer = null;
  var previouslyFocused = null;
  var selectedIndex = -1;
  function initSearchOverlay() {
  }
  function openSearchOverlay() {
    if (isOpen) return;
    isOpen = true;
    previouslyFocused = document.activeElement;
    ensureDOM();
    overlayEl.classList.add("search-overlay-open");
    searchInput.value = "";
    resultsContainer.innerHTML = '<div class="search-empty">Type to search across all panels</div>';
    selectedIndex = -1;
    searchInput.focus();
    document.addEventListener("keydown", handleOverlayKeydown);
  }
  function closeSearchOverlay() {
    if (!isOpen) return;
    isOpen = false;
    overlayEl?.classList.remove("search-overlay-open");
    document.removeEventListener("keydown", handleOverlayKeydown);
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  }
  function ensureDOM() {
    if (overlayEl) return;
    overlayEl = document.createElement("div");
    overlayEl.className = "search-overlay";
    overlayEl.innerHTML = `
    <div class="search-overlay-backdrop"></div>
    <div class="search-overlay-modal" role="dialog" aria-modal="true" aria-label="Search across all panels">
      <div class="search-input-wrapper">
        <span class="search-input-icon">&#128269;</span>
        <input type="text" class="search-input" placeholder="Search across all panels..." aria-label="Search query" />
      </div>
      <div class="search-results" role="listbox" aria-label="Search results"></div>
    </div>
  `;
    document.body.appendChild(overlayEl);
    searchInput = overlayEl.querySelector(".search-input");
    resultsContainer = overlayEl.querySelector(".search-results");
    overlayEl.querySelector(".search-overlay-backdrop").addEventListener("click", closeSearchOverlay);
    searchInput.addEventListener("input", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performSearch(searchInput.value), 150);
    });
  }
  function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
    if (!query.trim()) return escaped;
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${safeQuery})`, "gi");
    return escaped.replace(regex, '<mark class="search-highlight-match">$1</mark>');
  }
  function performSearch(query) {
    if (!resultsContainer) return;
    if (!query.trim()) {
      resultsContainer.innerHTML = '<div class="search-empty">Type to search across all panels</div>';
      return;
    }
    const lowerQuery = query.toLowerCase();
    const groups = {
      thinking: [],
      tools: [],
      hooks: [],
      timeline: []
    };
    document.querySelectorAll(".thinking-entry").forEach((el) => {
      if (el.textContent?.toLowerCase().includes(lowerQuery)) {
        groups.thinking.push(el);
      }
    });
    document.querySelectorAll(".tool-entry").forEach((el) => {
      if (el.textContent?.toLowerCase().includes(lowerQuery)) {
        groups.tools.push(el);
      }
    });
    document.querySelectorAll(".hook-entry").forEach((el) => {
      if (el.textContent?.toLowerCase().includes(lowerQuery)) {
        groups.hooks.push(el);
      }
    });
    document.querySelectorAll(".timeline-entry").forEach((el) => {
      const filterText = el.dataset.filterText || el.textContent || "";
      if (filterText.toLowerCase().includes(lowerQuery)) {
        groups.timeline.push(el);
      }
    });
    renderResults(groups, query);
  }
  function renderResults(groups, query) {
    if (!resultsContainer) return;
    const panelLabels = {
      thinking: "Thinking",
      tools: "Tools",
      hooks: "Hooks",
      timeline: "Timeline"
    };
    let totalResults = 0;
    let html = "";
    for (const [panel, entries] of Object.entries(groups)) {
      if (entries.length === 0) continue;
      const shown = entries.slice(0, 10);
      totalResults += entries.length;
      html += `<div class="search-group">`;
      html += `<div class="search-group-header">${panelLabels[panel]} <span class="search-group-count">(${entries.length})</span></div>`;
      for (const entry of shown) {
        const preview = (entry.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100);
        const entryId = entry.id || "";
        html += `<button class="search-result" data-panel="${panel}" data-entry-id="${escapeHtml(entryId)}">`;
        html += `<span class="search-result-text">${highlightMatch(preview, query)}</span>`;
        html += `</button>`;
      }
      if (entries.length > 10) {
        html += `<div class="search-more">+${entries.length - 10} more</div>`;
      }
      html += `</div>`;
    }
    if (totalResults === 0) {
      html = `<div class="search-empty">No results for "${escapeHtml(query)}"</div>`;
    }
    resultsContainer.innerHTML = html;
    selectedIndex = -1;
    resultsContainer.querySelectorAll(".search-result").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.panel || "";
        const entryId = btn.dataset.entryId || "";
        navigateToResult(panel, entryId);
      });
    });
  }
  function navigateToResult(panel, entryId) {
    selectView(panel);
    if (entryId) {
      const el = document.getElementById(entryId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("search-highlight");
        setTimeout(() => el.classList.remove("search-highlight"), 2e3);
      }
    }
    closeSearchOverlay();
  }
  function handleOverlayKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchOverlay();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const results = resultsContainer?.querySelectorAll(".search-result");
      if (!results || results.length === 0) return;
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        results[selectedIndex].classList.remove("search-result-active");
        results[selectedIndex].removeAttribute("aria-selected");
      }
      if (event.key === "ArrowDown") {
        selectedIndex = selectedIndex < results.length - 1 ? selectedIndex + 1 : 0;
      } else {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : results.length - 1;
      }
      results[selectedIndex].classList.add("search-result-active");
      results[selectedIndex].setAttribute("aria-selected", "true");
      results[selectedIndex].scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      const results = resultsContainer?.querySelectorAll(".search-result");
      if (results && selectedIndex >= 0 && selectedIndex < results.length) {
        event.preventDefault();
        results[selectedIndex].click();
        return;
      }
    }
    if (event.key === "Tab" && overlayEl) {
      const modal = overlayEl.querySelector(".search-overlay-modal");
      if (!modal) return;
      const focusable = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }

  // src/dashboard/ui/keyboard-help.ts
  var backdropElement = null;
  var previouslyFocused2 = null;
  var SHORTCUT_GROUPS = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: ["t"], desc: "Thinking view" },
        { keys: ["o"], desc: "Tools view" },
        { keys: ["h"], desc: "Hooks view" },
        { keys: ["m"], desc: "Team view" },
        { keys: ["k"], desc: "Tasks view" },
        { keys: ["l"], desc: "Timeline view" },
        { keys: ["p"], desc: "Plan view" }
      ]
    },
    {
      title: "Panels",
      shortcuts: [
        { keys: ["Shift", "T"], desc: "Toggle Thinking panel" },
        { keys: ["Shift", "O"], desc: "Toggle Tools panel" },
        { keys: ["Shift", "H"], desc: "Toggle Hooks panel" },
        { keys: ["Shift", "M"], desc: "Toggle Team panel" },
        { keys: ["Shift", "K"], desc: "Toggle Tasks panel" },
        { keys: ["Shift", "L"], desc: "Toggle Timeline panel" },
        { keys: ["Shift", "P"], desc: "Panel visibility settings" }
      ]
    },
    {
      title: "Actions",
      shortcuts: [
        { keys: ["/"], desc: "Focus filter input" },
        { keys: ["s"], desc: "Toggle auto-scroll" },
        { keys: ["c"], desc: "Clear all panels" },
        { keys: ["Esc"], desc: "Clear filters / close modal" },
        { keys: ["?"], desc: "Show this help" }
      ]
    },
    {
      title: "Commands",
      shortcuts: [
        { keys: ["\u2318", "K"], desc: "Global search" },
        { keys: ["\u2318", "E"], desc: "Export as Markdown" },
        { keys: ["\u2318", "O"], desc: "Open plan in editor" },
        { keys: ["\u2318", "Shift", "R"], desc: "Reveal plan in Finder" }
      ]
    }
  ];
  function renderKey(key) {
    return `<kbd>${key}</kbd>`;
  }
  function createModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "keyboard-help-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Keyboard shortcuts");
    const modal = document.createElement("div");
    modal.className = "keyboard-help-modal";
    const header = document.createElement("div");
    header.className = "keyboard-help-header";
    header.innerHTML = `
    <h2 class="keyboard-help-title">Keyboard Shortcuts</h2>
    <button class="keyboard-help-close" aria-label="Close">&times;</button>
  `;
    const body = document.createElement("div");
    body.className = "keyboard-help-body";
    const grid = document.createElement("div");
    grid.className = "keyboard-help-grid";
    for (const group of SHORTCUT_GROUPS) {
      const section = document.createElement("div");
      section.className = "keyboard-help-section";
      const title = document.createElement("h3");
      title.className = "keyboard-help-section-title";
      title.textContent = group.title;
      section.appendChild(title);
      const list = document.createElement("dl");
      list.className = "keyboard-help-list";
      for (const shortcut of group.shortcuts) {
        const row = document.createElement("div");
        row.className = "keyboard-help-row";
        const dt = document.createElement("dt");
        dt.className = "keyboard-help-keys";
        dt.innerHTML = shortcut.keys.map(renderKey).join(" ");
        const dd = document.createElement("dd");
        dd.className = "keyboard-help-desc";
        dd.textContent = shortcut.desc;
        row.appendChild(dt);
        row.appendChild(dd);
        list.appendChild(row);
      }
      section.appendChild(list);
      grid.appendChild(section);
    }
    body.appendChild(grid);
    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    return backdrop;
  }
  function handleKeydown(event) {
    if (event.key === "Escape") {
      closeKeyboardHelp();
      return;
    }
    if (event.key === "Tab" && backdropElement) {
      const focusable = backdropElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }
  function openKeyboardHelp() {
    if (backdropElement) return;
    previouslyFocused2 = document.activeElement;
    backdropElement = createModal();
    document.body.appendChild(backdropElement);
    backdropElement.addEventListener("click", (e) => {
      if (e.target === backdropElement) closeKeyboardHelp();
    });
    const closeBtn = backdropElement.querySelector(".keyboard-help-close");
    closeBtn?.addEventListener("click", closeKeyboardHelp);
    document.addEventListener("keydown", handleKeydown);
    requestAnimationFrame(() => {
      backdropElement?.classList.add("visible");
      closeBtn?.focus();
    });
  }
  function closeKeyboardHelp() {
    if (!backdropElement) return;
    document.removeEventListener("keydown", handleKeydown);
    backdropElement.classList.remove("visible");
    const el = backdropElement;
    setTimeout(() => {
      el.remove();
    }, 200);
    backdropElement = null;
    if (previouslyFocused2 instanceof HTMLElement) {
      previouslyFocused2.focus();
    }
    previouslyFocused2 = null;
  }
  function isKeyboardHelpOpen() {
    return backdropElement !== null;
  }

  // src/dashboard/ui/keyboard.ts
  var callbacks9 = null;
  function initKeyboard(cbs) {
    callbacks9 = cbs;
    document.addEventListener("keydown", handleKeydown2);
  }
  function handleKeydown2(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement?.getAttribute("contenteditable") === "true";
    if (isInputFocused) {
      if (event.key === "Escape") {
        activeElement.blur();
        event.preventDefault();
      }
      return;
    }
    if (!state.keyboardMode) {
      state.keyboardMode = true;
      document.body.classList.add("keyboard-mode");
    }
    if (event.key === "c" && !event.ctrlKey && !event.metaKey) {
      if (callbacks9) {
        callbacks9.clearAllPanels();
      }
      return;
    }
    if (event.key === "s" && !event.ctrlKey && !event.metaKey) {
      state.autoScroll = !state.autoScroll;
      elements.autoScrollCheckbox.checked = state.autoScroll;
      state.userScrolledUp = false;
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      elements.thinkingFilter.focus();
      return;
    }
    if (event.key === "Escape") {
      if (isKeyboardHelpOpen()) {
        closeKeyboardHelp();
        return;
      }
      state.thinkingFilter = "";
      state.toolsFilter = "";
      elements.thinkingFilter.value = "";
      elements.toolsFilter.value = "";
      filterAllThinking();
      filterAllTools();
      document.activeElement?.blur();
      return;
    }
    if (event.key === "?" || event.shiftKey && event.key === "/") {
      event.preventDefault();
      openKeyboardHelp();
      return;
    }
    if (isKeyboardHelpOpen()) return;
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      switch (event.key.toLowerCase()) {
        case "t":
          event.preventDefault();
          togglePanelCollapse("thinking");
          return;
        case "o":
          event.preventDefault();
          togglePanelCollapse("tools");
          return;
        case "a":
          event.preventDefault();
          togglePanelCollapse("agents");
          return;
        case "h":
          event.preventDefault();
          togglePanelCollapse("hooks");
          return;
        case "m":
          event.preventDefault();
          togglePanelCollapse("team");
          return;
        case "k":
          event.preventDefault();
          togglePanelCollapse("tasks");
          return;
        case "l":
          event.preventDefault();
          togglePanelCollapse("timeline");
          return;
        case "p":
          event.preventDefault();
          if (callbacks9) {
            callbacks9.togglePanelSelector();
          }
          return;
      }
    }
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
      switch (event.key.toLowerCase()) {
        case "t":
          selectView("thinking");
          return;
        case "o":
          selectView("tools");
          return;
        case "a":
          selectView("agents");
          return;
        case "h":
          selectView("hooks");
          return;
        case "m":
          selectView("team");
          return;
        case "k":
          selectView("tasks");
          return;
        case "l":
          selectView("timeline");
          return;
        case "p":
          selectView("plan");
          return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearchOverlay();
        return;
      }
      if (event.key.toLowerCase() === "e" && !event.shiftKey) {
        event.preventDefault();
        if (callbacks9) {
          callbacks9.tryOpenExportModal();
        }
        return;
      }
      if (event.key.toLowerCase() === "o" && !event.shiftKey) {
        if (state.currentPlanPath && callbacks9) {
          event.preventDefault();
          callbacks9.handlePlanOpenClick();
        }
        return;
      }
      if (event.key.toLowerCase() === "r" && event.shiftKey) {
        if (state.currentPlanPath && callbacks9) {
          event.preventDefault();
          callbacks9.handlePlanRevealClick();
        }
        return;
      }
    }
  }

  // src/dashboard/ui/panel-selector.ts
  var PANEL_LABELS = {
    thinking: "Thinking",
    tools: "Tools",
    hooks: "Hooks",
    plan: "Plan",
    team: "Team",
    tasks: "Tasks",
    timeline: "Timeline",
    agents: "Agents"
  };
  var PANEL_ORDER = ["thinking", "tools", "hooks", "team", "tasks", "timeline", "agents", "plan"];
  var modalElement = null;
  var isOpen2 = false;
  var previouslyFocused3 = null;
  var callbacks10 = null;
  function initPanelSelector(cbs) {
    callbacks10 = cbs;
  }
  function createModal2() {
    const backdrop = document.createElement("div");
    backdrop.className = "panel-selector-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "panel-selector-title");
    const modal = document.createElement("div");
    modal.className = "panel-selector-modal";
    const header = document.createElement("div");
    header.className = "panel-selector-header";
    const title = document.createElement("h3");
    title.id = "panel-selector-title";
    title.className = "panel-selector-title";
    title.textContent = "Panel Visibility";
    const closeBtn = document.createElement("button");
    closeBtn.className = "panel-selector-close";
    closeBtn.setAttribute("aria-label", "Close panel selector");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closePanelSelector);
    header.appendChild(title);
    header.appendChild(closeBtn);
    const list = document.createElement("div");
    list.className = "panel-selector-list";
    for (const panelName of PANEL_ORDER) {
      const item = document.createElement("label");
      item.className = "panel-selector-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "panel-selector-checkbox";
      checkbox.id = `panel-visibility-${panelName}`;
      checkbox.checked = state.panelVisibility[panelName];
      checkbox.addEventListener("change", () => {
        handlePanelToggle(panelName, checkbox.checked);
      });
      const label = document.createElement("span");
      label.className = "panel-selector-label";
      label.textContent = PANEL_LABELS[panelName];
      item.appendChild(checkbox);
      item.appendChild(label);
      list.appendChild(item);
    }
    modal.appendChild(header);
    modal.appendChild(list);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closePanelSelector();
      }
    });
    return backdrop;
  }
  function handlePanelToggle(panelName, visible) {
    state.panelVisibility[panelName] = visible;
    applyViewFilter();
    rebuildResizers();
    savePanelVisibility();
    if (callbacks10) {
      callbacks10.announceStatus(`${PANEL_LABELS[panelName]} panel ${visible ? "shown" : "hidden"}`);
    }
  }
  function applyAllPanelVisibility() {
    applyViewFilter();
    rebuildResizers();
  }
  function syncCheckboxes() {
    for (const panelName of PANEL_ORDER) {
      const checkbox = document.getElementById(`panel-visibility-${panelName}`);
      if (checkbox) {
        checkbox.checked = state.panelVisibility[panelName];
      }
    }
  }
  function openPanelSelector() {
    if (isOpen2) return;
    if (!modalElement) {
      modalElement = createModal2();
      document.body.appendChild(modalElement);
    }
    syncCheckboxes();
    previouslyFocused3 = document.activeElement;
    modalElement.classList.add("visible");
    isOpen2 = true;
    const firstCheckbox = modalElement.querySelector(".panel-selector-checkbox");
    if (firstCheckbox) {
      firstCheckbox.focus();
    }
    document.addEventListener("keydown", handleModalKeydown);
  }
  function closePanelSelector() {
    if (!isOpen2 || !modalElement) return;
    modalElement.classList.remove("visible");
    isOpen2 = false;
    document.removeEventListener("keydown", handleModalKeydown);
    if (previouslyFocused3 && previouslyFocused3.focus) {
      previouslyFocused3.focus();
      previouslyFocused3 = null;
    }
  }
  function togglePanelSelector() {
    if (isOpen2) {
      closePanelSelector();
    } else {
      openPanelSelector();
    }
  }
  function handleModalKeydown(event) {
    if (event.key === "Escape") {
      closePanelSelector();
      return;
    }
    if (event.key === "Tab" && modalElement) {
      const focusable = modalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }

  // src/dashboard/handlers/thinking.ts
  var callbacks11 = null;
  function initThinking(cbs) {
    callbacks11 = cbs;
  }
  function handleThinking(event) {
    if (!callbacks11) {
      console.error("[Thinking Handler] Callbacks not initialized - call initThinking() first");
      return;
    }
    state.thinkingCount++;
    updateThinkingCount();
    updateTabBadge("thinking", state.thinkingCount);
    const content = event.content;
    const time = formatTime(event.timestamp);
    const sessionId = event.sessionId;
    const preview = content.slice(0, 80).replace(/\n/g, " ");
    const eventAgentId = event.agentId;
    let agentId = eventAgentId;
    if (!agentId) {
      const contextAgentId = callbacks11.getCurrentAgentContext();
      const contextAgent = subagentState.subagents.get(contextAgentId);
      if (contextAgent && contextAgent.parentSessionId === sessionId) {
        agentId = contextAgentId;
      } else {
        agentId = "main";
      }
    }
    const agentDisplayName = callbacks11.getAgentDisplayName(agentId);
    const emptyState2 = elements.thinkingContent.querySelector(".empty-state");
    if (emptyState2) {
      emptyState2.remove();
    }
    const subagentMapping = eventAgentId ? subagentState.subagents.get(eventAgentId) : void 0;
    const isSubagentThinking = !!subagentMapping;
    const parentSessionId = subagentMapping?.parentSessionId;
    const entry = document.createElement("div");
    entry.className = isSubagentThinking ? "thinking-entry subagent-entry new" : "thinking-entry new";
    entry.dataset.agent = agentId;
    entry.dataset.session = sessionId || "";
    entry.dataset.content = content.toLowerCase();
    entry.dataset.timestamp = String(Date.now());
    entry.dataset.eventTimestamp = event.timestamp;
    if (parentSessionId) {
      entry.dataset.parentSession = parentSessionId;
    }
    const session = state.sessions.get(sessionId || "");
    const folderName = session?.workingDirectory ? getSessionDisplayName(session.workingDirectory) : null;
    const folderBadge = sessionId && folderName ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(folderName)}</span>` : "";
    const sessionBadge = sessionId && !folderName ? `<span class="entry-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>` : "";
    const subagentBadge = isSubagentThinking ? `<span class="entry-subagent-badge" title="Subagent thinking">${escapeHtml(subagentMapping.agentName)}</span>` : "";
    const agentBadgeColors = getAgentBadgeColors(agentDisplayName);
    entry.innerHTML = `
    <div class="thinking-entry-header">
      <span class="thinking-time">${escapeHtml(time)}</span>
      ${folderBadge}
      ${sessionBadge}
      ${subagentBadge}
      <span class="thinking-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(agentDisplayName)}</span>
      <span class="thinking-preview">${escapeHtml(preview)}...</span>
    </div>
    <div class="thinking-text">${escapeHtml(content)}</div>
  `;
    applyThinkingFilter(entry);
    callbacks11.appendAndTrim(elements.thinkingContent, entry);
    callbacks11.smartScroll(elements.thinkingContent);
    setTimeout(() => entry.classList.remove("new"), 1e3);
  }

  // src/dashboard/ui/duration-histogram.ts
  var BUCKETS = [
    { label: "<100ms", max: 100, color: "var(--color-accent-green)" },
    { label: "100-500ms", max: 500, color: "var(--color-accent-green)" },
    { label: "500ms-1s", max: 1e3, color: "var(--color-accent-yellow)" },
    { label: "1-5s", max: 5e3, color: "var(--color-accent-orange)" },
    { label: "5-15s", max: 15e3, color: "var(--color-accent-orange)" },
    { label: "15s+", max: Infinity, color: "var(--color-accent-red)" }
  ];
  var counts = new Array(BUCKETS.length).fill(0);
  var totalCalls = 0;
  var barElements = [];
  function initDurationHistogram() {
    const container = elements.durationHistogram;
    if (!container) return;
    container.innerHTML = "";
    barElements = [];
    for (let i = 0; i < BUCKETS.length; i++) {
      const bar = document.createElement("div");
      bar.className = "histogram-bar";
      bar.style.background = BUCKETS[i].color;
      bar.style.height = "2px";
      bar.title = `${BUCKETS[i].label}: 0 calls`;
      container.appendChild(bar);
      barElements.push(bar);
    }
  }
  function addDuration(ms) {
    totalCalls++;
    for (let i = 0; i < BUCKETS.length; i++) {
      if (ms < BUCKETS[i].max || i === BUCKETS.length - 1) {
        counts[i]++;
        break;
      }
    }
    renderBars();
  }
  function resetHistogram() {
    counts.fill(0);
    totalCalls = 0;
    renderBars();
  }
  function renderBars() {
    const max = Math.max(...counts, 1);
    for (let i = 0; i < barElements.length; i++) {
      const pct = counts[i] / max * 100;
      const height = Math.max(2, pct / 100 * 28);
      barElements[i].style.height = `${height}px`;
      const callPct = totalCalls > 0 ? Math.round(counts[i] / totalCalls * 100) : 0;
      barElements[i].title = `${BUCKETS[i].label}: ${counts[i]} calls (${callPct}%)`;
    }
  }

  // src/dashboard/utils/markdown.ts
  function parseTableAlignment(separator) {
    const trimmed = separator.trim();
    const hasLeft = trimmed.startsWith(":");
    const hasRight = trimmed.endsWith(":");
    if (hasLeft && hasRight) return "center";
    if (hasRight) return "right";
    return "left";
  }
  function renderTable(lines) {
    if (lines.length < 2) return lines.join("\n");
    const headerCells = lines[0].split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
    const separatorCells = lines[1].split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
    const isValidSeparator = separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell));
    if (!isValidSeparator || headerCells.length !== separatorCells.length) {
      return lines.join("\n");
    }
    const alignments = separatorCells.map(parseTableAlignment);
    let tableHtml = '<table class="md-table">';
    tableHtml += "<thead><tr>";
    headerCells.forEach((cell, i) => {
      const align = alignments[i] || "left";
      tableHtml += `<th style="text-align: ${escapeCssValue(align)}">${cell}</th>`;
    });
    tableHtml += "</tr></thead>";
    if (lines.length > 2) {
      tableHtml += "<tbody>";
      for (let i = 2; i < lines.length; i++) {
        const rowCells = lines[i].split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
        tableHtml += "<tr>";
        for (let j = 0; j < headerCells.length; j++) {
          const cell = rowCells[j] || "";
          const align = alignments[j] || "left";
          tableHtml += `<td style="text-align: ${escapeCssValue(align)}">${cell}</td>`;
        }
        tableHtml += "</tr>";
      }
      tableHtml += "</tbody>";
    }
    tableHtml += "</table>";
    return tableHtml;
  }
  function processTablesInContent(html) {
    const lines = html.split("\n");
    const result = [];
    let tableLines = [];
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const isTableRow = trimmedLine.startsWith("|") && trimmedLine.endsWith("|");
      if (isTableRow) {
        if (!inTable) {
          const nextLine = lines[i + 1]?.trim() || "";
          if (nextLine.startsWith("|") && nextLine.includes("---")) {
            inTable = true;
            tableLines = [line];
          } else {
            result.push(line);
          }
        } else {
          tableLines.push(line);
        }
      } else {
        if (inTable) {
          result.push(renderTable(tableLines));
          tableLines = [];
          inTable = false;
        }
        result.push(line);
      }
    }
    if (inTable && tableLines.length > 0) {
      result.push(renderTable(tableLines));
    }
    return result.join("\n");
  }
  function renderSimpleMarkdown(content) {
    let html = escapeHtml(content);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "<hr>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    html = html.replace(/^- \[ \] (.+)$/gm, '<li class="task-list-item"><span class="task-checkbox"></span>$1</li>');
    html = html.replace(/^- \[x\] (.+)$/gim, '<li class="task-list-item"><span class="task-checkbox checked"></span>$1</li>');
    html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
      return "<ul>" + match + "</ul>";
    });
    html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
    html = html.replace(/<\/blockquote>\n<blockquote>/g, "<br>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\b_([^_]+)_\b/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
      const decodedUrl = url.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const trimmedUrl = decodedUrl.trim().toLowerCase();
      const isSafeUrl = trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://") || trimmedUrl.startsWith("/") || trimmedUrl.startsWith("#") || trimmedUrl.startsWith("mailto:") || // Relative URLs (no protocol)
      !trimmedUrl.includes(":") && !trimmedUrl.startsWith("//");
      if (!isSafeUrl) {
        return `[${text}](${url})`;
      }
      const safeUrl = encodeHtmlAttribute(decodedUrl);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
    html = processTablesInContent(html);
    html = html.replace(/\n{3,}/g, "\n\n");
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/<ul><br>/g, "<ul>");
    html = html.replace(/<br><\/ul>/g, "</ul>");
    html = html.replace(/<\/li><br>/g, "</li>");
    html = html.replace(/<br><li/g, "<li");
    html = html.replace(/<br>(<h[123]>)/g, "$1");
    html = html.replace(/(<\/h[123]>)<br>/g, "$1");
    html = html.replace(/<br>(<table)/g, "$1");
    html = html.replace(/(<\/table>)<br>/g, "$1");
    html = html.replace(/<br>(<hr>)/g, "$1");
    html = html.replace(/(<hr>)<br>/g, "$1");
    html = html.replace(/<br>(<blockquote>)/g, "$1");
    html = html.replace(/(<\/blockquote>)<br>/g, "$1");
    html = html.replace(/<br>(<pre>)/g, "$1");
    html = html.replace(/(<\/pre>)<br>/g, "$1");
    html = html.replace(/(<br>){3,}/g, "<br><br>");
    return html;
  }

  // src/dashboard/handlers/tools.ts
  function processEscapes(str) {
    return str.replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  function detectPlanAccess(input, sessionId) {
    try {
      const parsed = JSON.parse(input);
      const filePath = parsed.file_path || parsed.path || "";
      const planPathMatch = filePath.match(/\.claude\/plans\/([^/]+\.md)$/);
      if (planPathMatch) {
        state.sessionPlanMap.set(sessionId, filePath);
        saveSessionPlanAssociation(sessionId, filePath);
        debug(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan: ${planPathMatch[1]}`);
      }
    } catch {
      const planPathMatch = input.match(/\.claude\/plans\/[^"'\s]+\.md/);
      if (planPathMatch) {
        state.sessionPlanMap.set(sessionId, planPathMatch[0]);
        saveSessionPlanAssociation(sessionId, planPathMatch[0]);
        debug(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan (regex): ${planPathMatch[0]}`);
      }
    }
  }
  var callbacks12 = null;
  function initTools(cbs) {
    callbacks12 = cbs;
  }
  function handleToolStart(event) {
    if (!callbacks12) {
      console.error("[Tools] Handler not initialized - call initTools first");
      return;
    }
    const toolName = event.toolName;
    const toolCallId = event.toolCallId || `tool-${Date.now()}`;
    const input = event.input;
    const time = formatTime(event.timestamp);
    const sessionId = event.sessionId;
    const eventAgentId = event.agentId;
    let agentId = eventAgentId;
    if (!agentId) {
      const contextAgentId = callbacks12.getCurrentAgentContext();
      const contextAgent = subagentState.subagents.get(contextAgentId);
      if (contextAgent && contextAgent.parentSessionId === sessionId) {
        agentId = contextAgentId;
      } else {
        agentId = "main";
      }
    }
    if ((toolName === "Read" || toolName === "Write" || toolName === "Edit") && input && sessionId) {
      detectPlanAccess(input, sessionId);
    }
    if (toolName === "SendMessage") {
      callbacks12.detectSendMessage(input, agentId, event.timestamp);
    }
    state.toolsCount++;
    updateToolsCount();
    updateTabBadge("tools", state.toolsCount);
    const emptyState2 = elements.toolsContent.querySelector(".empty-state");
    if (emptyState2) {
      emptyState2.remove();
    }
    const session = state.sessions.get(sessionId || "");
    const folderName = session?.workingDirectory ? getSessionDisplayName(session.workingDirectory) : null;
    const folderBadge = sessionId && folderName ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(folderName)}</span>` : "";
    const sessionBadge = sessionId && !folderName ? `<span class="entry-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>` : "";
    const preview = summarizeInput(input, toolName);
    const agentDisplayName = callbacks12.getAgentDisplayName(agentId);
    const agentBadgeColors = getAgentBadgeColors(agentDisplayName);
    const entry = document.createElement("div");
    entry.className = "tool-entry collapsed new";
    entry.id = `tool-${toolCallId}`;
    entry.dataset.toolName = toolName.toLowerCase();
    entry.dataset.session = sessionId || "";
    entry.dataset.input = (input || "").toLowerCase();
    entry.dataset.agent = agentId;
    entry.dataset.timestamp = String(Date.now());
    entry.innerHTML = `
    <div class="tool-entry-header">
      <div class="tool-header-line1">
        <span class="tool-toggle"></span>
        <span class="tool-time">${escapeHtml(time)}</span>
        ${folderBadge}
        ${sessionBadge}
      </div>
      <div class="tool-header-line2">
        <span class="tool-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(agentDisplayName)}</span>
        <span class="tool-name" title="${escapeHtml(toolName)}">${escapeHtml(shortenToolName(toolName))}</span>
        <span class="tool-preview">${escapeHtml(preview)}</span>
      </div>
    </div>
    <div class="tool-entry-details">
      <div class="tool-input-section">
        <div class="tool-input-label">INPUT</div>
        <div class="tool-input-content">${renderSimpleMarkdown(processEscapes(input || "(none)"))}</div>
      </div>
    </div>
  `;
    entry.addEventListener("click", (e) => {
      const target = e.target;
      if (!entry.classList.contains("collapsed") && target.closest(".tool-entry-details")) {
        return;
      }
      if (target.closest("a, button, .tool-file-path")) {
        return;
      }
      entry.classList.toggle("collapsed");
    });
    state.pendingTools.set(toolCallId, {
      id: toolCallId,
      name: toolName,
      input,
      startTime: event.timestamp,
      element: entry
    });
    applyToolsFilter(entry);
    callbacks12.appendAndTrim(elements.toolsContent, entry);
    callbacks12.smartScroll(elements.toolsContent);
    setTimeout(() => entry.classList.remove("new"), 1e3);
  }
  function handleToolEnd(event) {
    const toolCallId = event.toolCallId || "";
    const durationMs = event.durationMs;
    const entry = document.getElementById(`tool-${toolCallId}`);
    if (entry) {
      if (durationMs !== void 0) {
        const line2El = entry.querySelector(".tool-header-line2");
        if (line2El && !line2El.querySelector(".tool-duration")) {
          const durationEl = document.createElement("span");
          const durationClass = getDurationClass(durationMs);
          durationEl.className = `tool-duration ${durationClass}`;
          durationEl.textContent = formatDuration(durationMs);
          durationEl.title = `Duration: ${durationMs}ms`;
          line2El.appendChild(durationEl);
        }
      }
    }
    if (durationMs !== void 0) {
      addDuration(durationMs);
    }
    state.pendingTools.delete(toolCallId);
  }

  // src/dashboard/handlers/agents.ts
  function handleAgentStart(event) {
    const agentId = event.agentId;
    const agentName = event.agentName || agentId.slice(0, 8);
    const parentId = event.parentAgentId;
    state.agents.set(agentId, {
      id: agentId,
      name: agentName,
      parentId,
      sessionId: event.sessionId || state.currentSessionId || void 0,
      active: true,
      status: "running",
      startTime: event.timestamp
    });
    pushAgentContext(agentId);
    state.agentsCount = state.agents.size;
    if (elements.agentsCount) {
      elements.agentsCount.textContent = String(state.agentsCount);
    }
    renderAgentTree();
  }
  function handleAgentStop(event) {
    const agentId = event.agentId;
    const agent = state.agents.get(agentId);
    if (agent) {
      agent.active = false;
      agent.status = event.status || "success";
      agent.endTime = event.timestamp;
      popAgentContext(agentId);
      renderAgentTree();
    }
  }
  function handleSubagentMapping(event) {
    subagentState.subagents.clear();
    subagentState.sessionSubagents.clear();
    subagentState.agentChildren.clear();
    for (const mapping of event.mappings) {
      subagentState.subagents.set(mapping.agentId, mapping);
      let subagents = subagentState.sessionSubagents.get(mapping.parentSessionId);
      if (!subagents) {
        subagents = /* @__PURE__ */ new Set();
        subagentState.sessionSubagents.set(mapping.parentSessionId, subagents);
      }
      subagents.add(mapping.agentId);
      if (mapping.parentAgentId) {
        let children = subagentState.agentChildren.get(mapping.parentAgentId);
        if (!children) {
          children = /* @__PURE__ */ new Set();
          subagentState.agentChildren.set(mapping.parentAgentId, children);
        }
        children.add(mapping.agentId);
      }
    }
    debug(
      `[Dashboard] Subagent mappings updated: ${event.mappings.length} subagent(s), ${subagentState.agentChildren.size} parent(s) with children`
    );
    renderAgentTree();
  }
  function findActiveAgent() {
    let activeAgent;
    for (const agent of state.agents.values()) {
      if (agent.active && agent.status === "running") {
        if (!activeAgent || agent.startTime > activeAgent.startTime) {
          activeAgent = agent;
        }
      }
    }
    return activeAgent;
  }
  function getCurrentAgentContext() {
    return agentContextStack[agentContextStack.length - 1] || "main";
  }
  function pushAgentContext(agentId) {
    if (agentId && agentId !== "main") {
      while (agentContextStack.length >= MAX_AGENT_STACK_SIZE) {
        const removedId = agentContextStack.splice(1, 1)[0];
        if (removedId) {
          agentContextTimestamps.delete(removedId);
          console.warn(`[Dashboard] Agent stack overflow - removed stale agent: ${removedId}`);
        }
      }
      agentContextStack.push(agentId);
      agentContextTimestamps.set(agentId, Date.now());
      debug(`[Dashboard] Agent context pushed: ${agentId}, stack depth: ${agentContextStack.length}`);
    }
  }
  function popAgentContext(agentId) {
    if (agentId && agentId !== "main") {
      const index = agentContextStack.indexOf(agentId);
      if (index > 0) {
        agentContextStack.splice(index, 1);
        agentContextTimestamps.delete(agentId);
        debug(`[Dashboard] Agent context popped: ${agentId}, stack depth: ${agentContextStack.length}`);
      }
    }
  }
  function cleanupStaleAgentContexts() {
    const now = Date.now();
    const staleThreshold = now - AGENT_STACK_STALE_MS;
    let removedCount = 0;
    for (let i = agentContextStack.length - 1; i > 0; i--) {
      const agentId = agentContextStack[i];
      const timestamp = agentContextTimestamps.get(agentId);
      if (!timestamp || timestamp < staleThreshold) {
        agentContextStack.splice(i, 1);
        agentContextTimestamps.delete(agentId);
        removedCount++;
      }
    }
    if (removedCount > 0) {
      debug(`[Dashboard] Cleaned up ${removedCount} stale agent context(s), stack depth: ${agentContextStack.length}`);
    }
  }
  function getAgentDisplayName(agentId) {
    if (agentId === "main") {
      return "main";
    }
    const agent = state.agents.get(agentId);
    if (agent?.name) {
      return agent.name;
    }
    return agentId.length > 16 ? agentId.slice(0, 16) : agentId;
  }
  function renderAgentTree() {
    const treeContainer = elements.agentTreeContent;
    const treeSection = document.getElementById("agent-tree-section");
    if (!treeContainer) return;
    const rootAgents = [];
    for (const mapping of subagentState.subagents.values()) {
      if (!mapping.parentAgentId || !subagentState.subagents.has(mapping.parentAgentId)) {
        rootAgents.push(mapping);
      }
    }
    if (rootAgents.length === 0) {
      if (treeSection && subagentState.subagents.size === 0) {
        treeSection.style.display = "none";
      }
      treeContainer.innerHTML = "";
      return;
    }
    if (treeSection) {
      treeSection.style.display = "";
    }
    rootAgents.sort((a, b) => a.startTime.localeCompare(b.startTime));
    treeContainer.innerHTML = "";
    for (const root of rootAgents) {
      const node = renderAgentNode(root, 0);
      treeContainer.appendChild(node);
    }
  }
  function renderAgentNode(mapping, depth) {
    const node = document.createElement("div");
    node.className = "agent-tree-node";
    node.style.paddingLeft = `${depth * 16}px`;
    const statusClass = mapping.status === "running" ? "agent-status-running" : mapping.status === "success" ? "agent-status-success" : mapping.status === "failure" ? "agent-status-failure" : "agent-status-cancelled";
    const badgeColors = getAgentBadgeColors(mapping.agentName);
    const isSelected = state.selectedAgentId === mapping.agentId;
    let durationText = "";
    if (mapping.endTime && mapping.startTime) {
      const ms = new Date(mapping.endTime).getTime() - new Date(mapping.startTime).getTime();
      if (ms < 1e3) durationText = `${ms}ms`;
      else if (ms < 6e4) durationText = `${(ms / 1e3).toFixed(1)}s`;
      else durationText = `${(ms / 6e4).toFixed(1)}m`;
    }
    node.innerHTML = `
    <div class="agent-tree-item ${statusClass} ${isSelected ? "agent-tree-selected" : ""}" data-agent-id="${escapeHtml(mapping.agentId)}">
      ${depth > 0 ? '<span class="agent-tree-line">&#9492;</span>' : ""}
      <span class="agent-tree-dot ${statusClass}"></span>
      <span class="agent-tree-name" style="background: ${escapeCssValue(badgeColors.bg)}; color: ${escapeCssValue(badgeColors.text)}">${escapeHtml(mapping.agentName)}</span>
      ${durationText ? `<span class="agent-tree-duration">${escapeHtml(durationText)}</span>` : ""}
    </div>
  `;
    const item = node.querySelector(".agent-tree-item");
    item?.addEventListener("click", () => {
      const agentId = mapping.agentId;
      if (state.selectedAgentId === agentId) {
        selectAgentFilter(null);
      } else {
        selectAgentFilter(agentId);
      }
      renderAgentTree();
    });
    const children = subagentState.agentChildren.get(mapping.agentId);
    if (children) {
      for (const childId of children) {
        const childMapping = subagentState.subagents.get(childId);
        if (childMapping) {
          const childNode = renderAgentNode(childMapping, depth + 1);
          node.appendChild(childNode);
        }
      }
    }
    return node;
  }
  var agentContextCleanupInterval = setInterval(cleanupStaleAgentContexts, AGENT_STACK_CLEANUP_INTERVAL_MS);
  window.addEventListener("beforeunload", () => {
    clearInterval(agentContextCleanupInterval);
  });

  // src/dashboard/handlers/plans.ts
  var callbacks13 = null;
  function initPlans(cbs) {
    callbacks13 = cbs;
  }
  function handlePlanList(event) {
    const plans = event.plans;
    state.planList = plans.map((p) => ({
      path: p.path,
      filename: p.filename,
      lastModified: p.lastModified
    }));
    debug(`[Dashboard] Received plan list with ${state.planList.length} plans`);
    renderPlanSelector();
  }
  function handlePlanUpdate(event) {
    const filename = event.filename;
    const path = event.path;
    const content = event.content || "";
    const lastModified = event.lastModified ?? Date.now();
    const activeAgent = callbacks13?.findActiveAgent();
    state.plans.set(path, {
      path,
      filename,
      content,
      lastModified,
      sessionId: event.sessionId || void 0,
      agentId: activeAgent?.id
    });
    const existingIndex = state.planList.findIndex((p) => p.path === path);
    if (existingIndex >= 0) {
      state.planList[existingIndex] = { path, filename, lastModified };
    } else {
      state.planList.push({ path, filename, lastModified });
    }
    state.planList.sort((a, b) => b.lastModified - a.lastModified);
    renderPlanSelector();
    const isCurrentPlan = state.currentPlanPath === path;
    const selectedSessionPlan = state.selectedSession !== "all" ? state.sessionPlanMap.get(state.selectedSession) : null;
    const isSelectedSessionPlan = selectedSessionPlan === path;
    if (isCurrentPlan) {
      displayPlan(path);
    } else if (isSelectedSessionPlan) {
      displayPlan(path);
    }
  }
  function handlePlanDelete(event) {
    const path = event.path;
    if (path) {
      state.plans.delete(path);
      state.planList = state.planList.filter((p) => p.path !== path);
    }
    renderPlanSelector();
    if (state.currentPlanPath === path) {
      if (state.selectedSession === "all") {
        displayEmptyPlan();
      } else {
        displayMostRecentPlan();
      }
    }
  }
  function displayMostRecentPlan() {
    if (state.plans.size === 0) {
      displayEmptyPlan();
      return;
    }
    let mostRecent = null;
    for (const plan of state.plans.values()) {
      if (!mostRecent || plan.lastModified > mostRecent.lastModified) {
        mostRecent = plan;
      }
    }
    if (!mostRecent) {
      displayEmptyPlan();
      return;
    }
    displayPlan(mostRecent.path);
  }
  function displayPlan(planPath) {
    const plan = state.plans.get(planPath);
    if (!plan) {
      state.currentPlanPath = planPath;
      const listItem = state.planList.find((p) => p.path === planPath);
      elements.planSelectorText.textContent = listItem?.filename || "Loading...";
      elements.planContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">...</span>
        <p>Loading plan content...</p>
      </div>
    `;
      updatePlanMeta(null);
      updatePlanActionButtons();
      requestPlanContent(planPath);
      return;
    }
    state.currentPlanPath = planPath;
    elements.planSelectorText.textContent = plan.filename;
    elements.planContent.innerHTML = `
    <div class="plan-markdown">${renderSimpleMarkdown(plan.content)}</div>
  `;
    updatePlanMeta(plan);
    updatePlanActionButtons();
    renderPlanSelector();
  }
  function displayEmptyPlan() {
    state.currentPlanPath = null;
    elements.planSelectorText.textContent = "No active plan";
    const message = state.selectedSession === "all" && state.sessions.size > 0 ? "Select a session to view its plan" : "No plan file loaded";
    elements.planContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#128196;</div>
      <p class="empty-state-title">${message}</p>
    </div>
  `;
    updatePlanMeta(null);
    updatePlanActionButtons();
    renderPlanSelector();
  }
  function displaySessionPlanEmpty(sessionId) {
    state.currentPlanPath = null;
    const shortId = sessionId.slice(0, 8);
    elements.planSelectorText.textContent = "No plan for session";
    elements.planContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#128196;</div>
      <p class="empty-state-title">No plan associated with session ${shortId}</p>
      <p class="empty-state-subtitle">Use the dropdown to browse all plans</p>
    </div>
  `;
    updatePlanMeta(null);
    updatePlanActionButtons();
    renderPlanSelector();
  }
  function updatePlanMeta(plan) {
    if (!plan) {
      elements.planMeta.classList.remove("visible");
      elements.planMeta.innerHTML = "";
      return;
    }
    const modifiedDate = new Date(plan.lastModified);
    const timeAgo = formatTimeAgo(modifiedDate);
    const fullTime = modifiedDate.toLocaleString();
    const shortPath = plan.path.replace(/^.*\/\.claude\//, "~/.claude/");
    elements.planMeta.innerHTML = `
    <span class="plan-meta-item">
      <span class="plan-meta-label">Modified:</span>
      <span class="plan-meta-value plan-meta-time" title="${escapeHtml(fullTime)}">${escapeHtml(timeAgo)}</span>
    </span>
    <span class="plan-meta-item plan-meta-path" title="${escapeHtml(plan.path)}">
      <span class="plan-meta-label">Path:</span>
      <span class="plan-meta-value">${escapeHtml(shortPath)}</span>
    </span>
  `;
    elements.planMeta.classList.add("visible");
  }
  function renderPlanSelector() {
    const dropdown = elements.planSelectorDropdown;
    if (state.planList.length === 0) {
      dropdown.innerHTML = `
      <li class="plan-selector-empty">No plans available</li>
    `;
      return;
    }
    let html = "";
    for (const plan of state.planList) {
      const isActive = plan.path === state.currentPlanPath;
      const date = new Date(plan.lastModified);
      const timeAgo = formatTimeAgo(date);
      html += `
      <li>
        <button
          class="plan-selector-option${isActive ? " active" : ""}"
          data-path="${escapeHtml(plan.path)}"
          role="option"
          aria-selected="${isActive}"
          title="${escapeHtml(plan.path)}"
        >
          <span class="plan-selector-option-name">${escapeHtml(plan.filename)}</span>
          <span class="plan-selector-option-badge">${escapeHtml(timeAgo)}</span>
        </button>
      </li>
    `;
    }
    dropdown.innerHTML = html;
    dropdown.querySelectorAll(".plan-selector-option").forEach((option) => {
      const optionEl = option;
      const path = optionEl.dataset.path;
      optionEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (path) {
          selectPlan(path);
        }
      });
      optionEl.addEventListener("contextmenu", (e) => {
        if (path) {
          handlePlanOptionContextMenu(e, path);
        }
      });
    });
  }
  function selectPlan(planPath) {
    closePlanSelector();
    const plan = state.plans.get(planPath);
    if (plan) {
      displayPlan(planPath);
    } else {
      state.currentPlanPath = planPath;
      const listItem = state.planList.find((p) => p.path === planPath);
      elements.planSelectorText.textContent = listItem?.filename || planPath;
      elements.planContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">...</span>
        <p>Loading plan content...</p>
      </div>
    `;
      updatePlanMeta(null);
      updatePlanActionButtons();
      renderPlanSelector();
      requestPlanContent(planPath);
    }
  }
  function requestPlanContent(planPath) {
    const ws2 = getWebSocket();
    if (!ws2 || ws2.readyState !== WebSocket.OPEN) {
      console.warn("[Dashboard] Cannot request plan content: WebSocket not connected");
      return;
    }
    const request = {
      type: "plan_request",
      path: planPath
    };
    if (!sendMessage(request)) {
      console.error("[Dashboard] Failed to request plan content: WebSocket not connected");
      return;
    }
    debug(`[Dashboard] Requested plan content: ${planPath}`);
  }
  function togglePlanSelector() {
    if (state.planSelectorOpen) {
      closePlanSelector();
    } else {
      openPlanSelector();
    }
  }
  function openPlanSelector() {
    state.planSelectorOpen = true;
    elements.planSelectorBtn.setAttribute("aria-expanded", "true");
    const btnRect = elements.planSelectorBtn.getBoundingClientRect();
    const dropdown = elements.planSelectorDropdown;
    dropdown.style.top = `${btnRect.bottom + 4}px`;
    dropdown.style.right = `${window.innerWidth - btnRect.right}px`;
    dropdown.style.left = "auto";
    dropdown.classList.add("visible");
    requestAnimationFrame(() => {
      const dropdownRect = dropdown.getBoundingClientRect();
      if (dropdownRect.bottom > window.innerHeight - 10) {
        dropdown.style.top = `${btnRect.top - dropdownRect.height - 4}px`;
      }
    });
  }
  function closePlanSelector() {
    state.planSelectorOpen = false;
    elements.planSelectorBtn.setAttribute("aria-expanded", "false");
    elements.planSelectorDropdown.classList.remove("visible");
  }
  function formatTimeAgo(date) {
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1e3);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  }
  function showFileContextMenu(x, y, filePath) {
    state.contextMenuFilePath = filePath;
    const menu = elements.planContextMenu;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (rect.right > viewportWidth) {
        menu.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menu.style.top = `${y - rect.height}px`;
      }
    });
    menu.classList.add("visible");
  }
  function hidePlanContextMenu() {
    elements.planContextMenu.classList.remove("visible");
    state.contextMenuFilePath = null;
  }
  async function executeFileAction(action, path) {
    try {
      const response = await fetch("http://localhost:3355/file-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action, path })
      });
      const result = await response.json();
      if (!result.success) {
        console.error(`[Dashboard] File action failed: ${result.error}`);
        callbacks13?.showToast(result.error || "Action failed", "error");
      } else {
        const actionText = action === "open" ? "Opened in default app" : "Revealed in Finder";
        callbacks13?.showToast(actionText, "success");
      }
    } catch (error) {
      console.error("[Dashboard] Failed to execute file action:", error);
      callbacks13?.showToast("Failed to connect to server", "error");
    }
  }
  function updatePlanActionButtons() {
    const hasActivePlan = state.currentPlanPath !== null;
    elements.planOpenBtn.disabled = !hasActivePlan;
    elements.planRevealBtn.disabled = !hasActivePlan;
  }
  function handlePlanOpenClick() {
    if (state.currentPlanPath) {
      executeFileAction("open", state.currentPlanPath);
    }
  }
  function handlePlanRevealClick() {
    if (state.currentPlanPath) {
      executeFileAction("reveal", state.currentPlanPath);
    }
  }
  function handleContextMenuOpen() {
    if (state.contextMenuFilePath) {
      executeFileAction("open", state.contextMenuFilePath);
    }
    hidePlanContextMenu();
  }
  function handleContextMenuReveal() {
    if (state.contextMenuFilePath) {
      executeFileAction("reveal", state.contextMenuFilePath);
    }
    hidePlanContextMenu();
  }
  function handlePlanContextMenu(event) {
    if (!state.currentPlanPath) {
      return;
    }
    event.preventDefault();
    showFileContextMenu(event.clientX, event.clientY, state.currentPlanPath);
  }
  function handlePlanOptionContextMenu(event, planPath) {
    event.preventDefault();
    event.stopPropagation();
    showFileContextMenu(event.clientX, event.clientY, planPath);
  }

  // src/dashboard/handlers/agents-view.ts
  var selectedViewAgent = null;
  var agentThinkingCounts = /* @__PURE__ */ new Map();
  var agentThinkingEntries = /* @__PURE__ */ new Map();
  var MAX_ENTRIES_PER_AGENT = 200;
  function initAgentsView() {
  }
  function renderAgentsList() {
    const sidebar = elements.agentsSidebar;
    if (!sidebar) return;
    const items = [];
    const mainCount = agentThinkingCounts.get("main") || 0;
    const mainSelected = selectedViewAgent === "main";
    items.push(`
    <div class="agent-list-item${mainSelected ? " selected" : ""}" data-agent-id="main">
      <span class="agent-list-dot running"></span>
      <span class="agent-list-name">main</span>
      <span class="agent-list-count">${mainCount}</span>
    </div>
  `);
    for (const [agentId, mapping] of subagentState.subagents) {
      const count = agentThinkingCounts.get(agentId) || 0;
      const isSelected = selectedViewAgent === agentId;
      const dotClass = mapping.status === "running" ? "running" : mapping.status === "success" || mapping.status === "failure" || mapping.status === "cancelled" ? "stopped" : "idle";
      const session = state.sessions.get(mapping.parentSessionId);
      const sessionLabel = getSessionDisplayName(session?.workingDirectory, mapping.parentSessionId);
      items.push(`
      <div class="agent-list-item${isSelected ? " selected" : ""}" data-agent-id="${escapeHtml(agentId)}" title="${escapeHtml(mapping.agentName)} (${escapeHtml(mapping.status)})
Session: ${escapeHtml(sessionLabel)}">
        <span class="agent-list-dot ${dotClass}"></span>
        <span class="agent-list-name">${escapeHtml(mapping.agentName)}</span>
        <span class="agent-list-count">${count}</span>
      </div>
    `);
    }
    sidebar.innerHTML = items.join("");
    sidebar.querySelectorAll(".agent-list-item").forEach((item) => {
      item.addEventListener("click", () => {
        const agentId = item.dataset.agentId;
        if (agentId) {
          selectAgentInView(agentId);
        }
      });
    });
  }
  function selectAgentInView(agentId) {
    selectedViewAgent = agentId;
    renderAgentsList();
    renderAgentDetail();
  }
  function renderAgentDetail() {
    const detail = elements.agentsDetail;
    if (!detail) return;
    if (!selectedViewAgent) {
      detail.innerHTML = `<div class="empty-state"><p>Select an agent to view its thinking</p></div>`;
      return;
    }
    const entries = agentThinkingEntries.get(selectedViewAgent) || [];
    if (entries.length === 0) {
      const agentName = selectedViewAgent === "main" ? "main" : subagentState.subagents.get(selectedViewAgent)?.agentName || selectedViewAgent;
      detail.innerHTML = `<div class="empty-state"><p>No thinking entries for ${escapeHtml(agentName)}</p></div>`;
      return;
    }
    const html = entries.map((entry) => {
      const time = formatTime(entry.timestamp);
      const preview = entry.content.slice(0, 80).replace(/\n/g, " ");
      return `
      <div class="thinking-entry">
        <div class="thinking-entry-header">
          <span class="thinking-time">${escapeHtml(time)}</span>
          <span class="thinking-preview">${escapeHtml(preview)}...</span>
        </div>
        <div class="thinking-text">${escapeHtml(entry.content)}</div>
      </div>
    `;
    }).join("");
    detail.innerHTML = html;
    detail.scrollTop = detail.scrollHeight;
  }
  function addAgentThinking(event) {
    const eventAgentId = event.agentId;
    let agentId = eventAgentId || "main";
    if (!eventAgentId && event.sessionId) {
      agentId = "main";
    }
    agentThinkingCounts.set(agentId, (agentThinkingCounts.get(agentId) || 0) + 1);
    let entries = agentThinkingEntries.get(agentId);
    if (!entries) {
      entries = [];
      agentThinkingEntries.set(agentId, entries);
    }
    entries.push({
      timestamp: event.timestamp,
      content: event.content,
      sessionId: event.sessionId || ""
    });
    while (entries.length > MAX_ENTRIES_PER_AGENT) {
      entries.shift();
    }
    const totalCount = Array.from(agentThinkingCounts.values()).reduce((a, b) => a + b, 0);
    updateTabBadge("agents", totalCount);
    if (selectedViewAgent === agentId) {
      renderAgentDetail();
    }
    renderAgentsList();
  }
  function resetAgentsView() {
    selectedViewAgent = null;
    agentThinkingCounts.clear();
    agentThinkingEntries.clear();
    renderAgentsList();
    const detail = elements.agentsDetail;
    if (detail) {
      detail.innerHTML = `<div class="empty-state"><p>Select an agent to view its thinking</p></div>`;
    }
  }

  // src/dashboard/ui/stats-bar.ts
  var MAX_SESSION_STATS = 50;
  function createStatsState() {
    return {
      toolCounts: /* @__PURE__ */ new Map(),
      durations: [],
      thinkingCount: 0,
      hookDecisions: { allow: 0, deny: 0, ask: 0 },
      eventTimestamps: []
    };
  }
  var globalStats = createStatsState();
  var sessionStats = /* @__PURE__ */ new Map();
  var currentStatsSource = "all";
  var cellElements = { topTools: null, avgP95: null, thinking: null, hooks: null, rate: null };
  function initStatsBar() {
    const container = elements.statsBar;
    if (!container) return;
    container.innerHTML = `
    <div class="stat-cell" data-stat-tooltip="Most frequently used tools this session, ranked by call count" title="Most frequently used tools this session, ranked by call count">
      <span class="stat-label">Top Tools</span>
      <span class="stat-value" id="stat-top-tools">--</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Average and 95th percentile tool execution time. P95 = 95% of calls complete within this duration" title="Average and 95th percentile tool execution time. P95 = 95% of calls complete within this duration">
      <span class="stat-label">Avg / P95</span>
      <span class="stat-value" id="stat-avg-p95">--</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Number of thinking/reasoning blocks Claude has produced this session" title="Number of thinking/reasoning blocks Claude has produced this session">
      <span class="stat-label">Thinking</span>
      <span class="stat-value" id="stat-thinking">0</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Hook execution results: allowed / denied / asked. Hooks run before and after tool calls" title="Hook execution results: allowed / denied / asked. Hooks run before and after tool calls">
      <span class="stat-label">Hooks</span>
      <span class="stat-value" id="stat-hooks">0 / 0 / 0</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Events per minute over the last 60 seconds (sliding window)" title="Events per minute over the last 60 seconds (sliding window)">
      <span class="stat-label">Rate</span>
      <span class="stat-value" id="stat-rate">--</span>
    </div>
  `;
    cellElements = {
      topTools: document.getElementById("stat-top-tools"),
      avgP95: document.getElementById("stat-avg-p95"),
      thinking: document.getElementById("stat-thinking"),
      hooks: document.getElementById("stat-hooks"),
      rate: document.getElementById("stat-rate")
    };
  }
  function getSessionStats(sessionId) {
    let stats = sessionStats.get(sessionId);
    if (!stats) {
      if (sessionStats.size >= MAX_SESSION_STATS) {
        const firstKey = sessionStats.keys().next().value;
        if (firstKey) sessionStats.delete(firstKey);
      }
      stats = createStatsState();
      sessionStats.set(sessionId, stats);
    }
    return stats;
  }
  function accumulateStats(stats, event) {
    stats.eventTimestamps.push(Date.now());
    switch (event.type) {
      case "tool_start":
        stats.toolCounts.set(event.toolName, (stats.toolCounts.get(event.toolName) || 0) + 1);
        break;
      case "tool_end":
        if (event.durationMs !== void 0) {
          stats.durations.push(event.durationMs);
        }
        break;
      case "thinking":
        stats.thinkingCount++;
        break;
      case "hook_execution":
        if (event.decision === "allow") stats.hookDecisions.allow++;
        else if (event.decision === "deny") stats.hookDecisions.deny++;
        else stats.hookDecisions.ask++;
        break;
    }
  }
  function updateStats(event, sessionId) {
    accumulateStats(globalStats, event);
    if (sessionId) {
      accumulateStats(getSessionStats(sessionId), event);
    }
  }
  function setStatsSource(sessionId) {
    currentStatsSource = sessionId;
    renderStats();
  }
  function renderStatsFromState(stats) {
    if (cellElements.topTools) {
      const sorted = [...stats.toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (sorted.length > 0) {
        cellElements.topTools.textContent = sorted.map(([name, count]) => `${shortenToolName(name)}: ${count}`).join(" | ");
        const parent = cellElements.topTools.closest(".stat-cell");
        if (parent) {
          parent.setAttribute("title", sorted.map(([name, count]) => `${name}: ${count}`).join("\n"));
        }
      } else {
        cellElements.topTools.textContent = "--";
      }
    }
    if (cellElements.avgP95) {
      if (stats.durations.length > 0) {
        const avg = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
        const p95 = percentile(stats.durations, 95);
        const avgClass = getDurationClass(avg);
        cellElements.avgP95.textContent = `${formatDuration(avg)} / ${formatDuration(p95)}`;
        cellElements.avgP95.className = `stat-value ${avgClass}`;
      } else {
        cellElements.avgP95.textContent = "--";
        cellElements.avgP95.className = "stat-value";
      }
    }
    if (cellElements.thinking) {
      cellElements.thinking.textContent = String(stats.thinkingCount);
    }
    if (cellElements.hooks) {
      const { allow, deny, ask } = stats.hookDecisions;
      const total = allow + deny + ask;
      if (total > 0) {
        cellElements.hooks.innerHTML = `<span>${allow}</span> / <span class="${deny > 0 ? "stat-deny" : ""}">${deny}</span> / <span>${ask}</span>`;
      } else {
        cellElements.hooks.textContent = "0 / 0 / 0";
      }
    }
    if (cellElements.rate) {
      const now = Date.now();
      const windowMs = 6e4;
      while (stats.eventTimestamps.length > 0 && stats.eventTimestamps[0] < now - windowMs) {
        stats.eventTimestamps.shift();
      }
      const eventsPerMin = stats.eventTimestamps.length;
      cellElements.rate.textContent = eventsPerMin > 0 ? `${eventsPerMin}/min` : "--";
    }
  }
  function renderStats() {
    if (currentStatsSource === "all") {
      renderStatsFromState(globalStats);
    } else {
      const stats = sessionStats.get(currentStatsSource);
      if (stats) {
        renderStatsFromState(stats);
      } else {
        renderStatsFromState(createStatsState());
      }
    }
  }
  function resetStats() {
    globalStats.toolCounts.clear();
    globalStats.durations = [];
    globalStats.thinkingCount = 0;
    globalStats.hookDecisions = { allow: 0, deny: 0, ask: 0 };
    globalStats.eventTimestamps = [];
    sessionStats.clear();
    currentStatsSource = "all";
    renderStats();
  }
  function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(p / 100 * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  // src/dashboard/handlers/dispatcher.ts
  function handleEvent(event) {
    state.eventCount++;
    elements.eventCount.textContent = `Events: ${state.eventCount}`;
    addTimelineEntry(event);
    updateStats(event, event.sessionId);
    debug(`[Dashboard] Event received:`, {
      type: event.type,
      sessionId: event.sessionId,
      agentId: event.agentId,
      timestamp: event.timestamp
    });
    if (event.sessionId) {
      trackSession(event.sessionId, event.timestamp);
    }
    try {
      switch (event.type) {
        case "connection_status":
          handleConnectionStatus(event);
          break;
        case "thinking":
          handleThinking(event);
          addAgentThinking(event);
          if (event.sessionId) {
            updateSessionActivity(event.sessionId);
          }
          break;
        case "tool_start":
          handleToolStart(event);
          if (event.sessionId) {
            updateSessionActivity(event.sessionId);
          }
          break;
        case "tool_end":
          handleToolEnd(event);
          if (event.sessionId) {
            updateSessionActivity(event.sessionId);
          }
          break;
        case "agent_start":
          handleAgentStart(event);
          break;
        case "agent_stop":
          handleAgentStop(event);
          break;
        case "session_start":
          handleSessionStart(event);
          break;
        case "session_stop":
          handleSessionStop(event);
          break;
        case "plan_update":
          handlePlanUpdate(event);
          break;
        case "plan_delete":
          handlePlanDelete(event);
          break;
        case "plan_list":
          handlePlanList(event);
          break;
        case "hook_execution":
          handleHookExecution(event);
          if (event.sessionId) {
            updateSessionActivity(event.sessionId);
          }
          break;
        case "subagent_mapping":
          handleSubagentMapping(event);
          updateSessionFilter();
          break;
        case "team_update":
          handleTeamUpdate(event);
          break;
        case "task_update":
          handleTaskUpdate(event);
          break;
        case "message_sent":
          handleMessageSent(event);
          break;
        case "teammate_idle":
          handleTeammateIdle(event);
          break;
        case "task_completed":
          handleTaskCompleted(event);
          break;
        default: {
          const exhaustiveCheck = event;
          debug("[Dashboard] Unhandled event type:", exhaustiveCheck.type);
        }
      }
    } catch (error) {
      debug("[Dashboard] Error handling event:", {
        type: event.type,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
  function handleConnectionStatus(event) {
    const version = event.serverVersion || "unknown";
    elements.serverInfo.textContent = `Server: v${version}`;
  }

  // src/dashboard/ui/tooltip.ts
  var TOOLTIP_DELAY_MS = 300;
  var tooltipTimer = null;
  function initTooltip() {
    if (!elements.sessionTooltip) {
      const tooltip = document.createElement("div");
      tooltip.id = "session-tooltip";
      tooltip.className = "session-tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.setAttribute("aria-hidden", "true");
      document.body.appendChild(tooltip);
      elements.sessionTooltip = tooltip;
    }
    document.addEventListener("mouseenter", handleTooltipMouseEnter, true);
    document.addEventListener("mouseleave", handleTooltipMouseLeave, true);
    document.addEventListener("mouseenter", handleStatTooltipMouseEnter, true);
    document.addEventListener("mouseleave", handleStatTooltipMouseLeave, true);
  }
  function handleTooltipMouseEnter(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest("[data-session-tooltip]");
    if (!tooltipTarget) return;
    const sessionId = tooltipTarget.dataset.sessionId;
    const sessionPath = tooltipTarget.dataset.sessionPath;
    if (!sessionId) return;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
    }
    tooltipTimer = setTimeout(() => {
      showTooltip(tooltipTarget, sessionId, sessionPath);
    }, TOOLTIP_DELAY_MS);
  }
  function handleTooltipMouseLeave(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest("[data-session-tooltip]");
    if (!tooltipTarget) return;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    hideTooltip();
  }
  function extractFolderName(path) {
    const parts = path.replace(/\/$/, "").split("/");
    return parts[parts.length - 1] || path;
  }
  function showTooltip(target, sessionId, sessionPath) {
    const tooltip = elements.sessionTooltip;
    if (!tooltip) return;
    let content = "";
    if (sessionPath) {
      const folderName = extractFolderName(sessionPath);
      content += `<div class="session-tooltip-folder">${escapeHtml(folderName)}</div>`;
      content += `<div class="session-tooltip-path">${escapeHtml(sessionPath)}</div>`;
    }
    content += `<div class="session-tooltip-id">Session: ${escapeHtml(sessionId)}</div>`;
    tooltip.innerHTML = content;
    const rect = target.getBoundingClientRect();
    let left = rect.left + rect.width / 2;
    let top = rect.bottom + 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    tooltip.classList.add("visible");
    const actualRect = tooltip.getBoundingClientRect();
    if (left + actualRect.width / 2 > viewportWidth - 10) {
      left = viewportWidth - actualRect.width / 2 - 10;
    }
    if (left - actualRect.width / 2 < 10) {
      left = actualRect.width / 2 + 10;
    }
    if (top + actualRect.height > viewportHeight - 10) {
      top = rect.top - actualRect.height - 8;
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.setAttribute("aria-hidden", "false");
  }
  function handleStatTooltipMouseEnter(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest("[data-stat-tooltip]");
    if (!tooltipTarget) return;
    const tooltipText = tooltipTarget.dataset.statTooltip;
    if (!tooltipText) return;
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      showStatTooltip(tooltipTarget, tooltipText);
    }, TOOLTIP_DELAY_MS);
  }
  function handleStatTooltipMouseLeave(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest("[data-stat-tooltip]");
    if (!tooltipTarget) return;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    hideTooltip();
  }
  function showStatTooltip(target, text) {
    const tooltip = elements.sessionTooltip;
    if (!tooltip) return;
    tooltip.innerHTML = `<div class="session-tooltip-path">${escapeHtml(text)}</div>`;
    const rect = target.getBoundingClientRect();
    tooltip.classList.add("visible");
    const actualRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2;
    let top = rect.top - actualRect.height - 8;
    const viewportWidth = window.innerWidth;
    if (left + actualRect.width / 2 > viewportWidth - 10) {
      left = viewportWidth - actualRect.width / 2 - 10;
    }
    if (left - actualRect.width / 2 < 10) {
      left = actualRect.width / 2 + 10;
    }
    if (top < 10) {
      top = rect.bottom + 8;
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.setAttribute("aria-hidden", "false");
  }
  function hideTooltip() {
    const tooltip = elements.sessionTooltip;
    if (!tooltip) return;
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
  }

  // src/dashboard/utils/markdown-export.ts
  function formatLocalTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  }
  function extractSessionData(options) {
    const sessionId = state.selectedSession !== "all" ? state.selectedSession : state.currentSessionId;
    const session = sessionId ? state.sessions.get(sessionId) || null : null;
    return {
      session,
      sessionId,
      thinkingBlocks: options?.includeThinking !== false ? extractThinkingBlocks(sessionId) : [],
      toolCalls: options?.includeTools !== false ? extractToolCalls(sessionId) : [],
      hooks: options?.includeHooks !== false ? extractHooks(sessionId) : [],
      plan: extractPlanData()
    };
  }
  function extractThinkingBlocks(sessionId) {
    const blocks = [];
    const thinkingContent = document.getElementById("thinking-content");
    if (!thinkingContent) return blocks;
    const entries = thinkingContent.querySelectorAll(".thinking-entry");
    entries.forEach((entry) => {
      const el = entry;
      if (sessionId && sessionId !== "all" && el.dataset.session !== sessionId) {
        return;
      }
      const timeEl = el.querySelector(".thinking-time");
      const agentEl = el.querySelector(".thinking-agent");
      const textEl = el.querySelector(".thinking-text");
      blocks.push({
        timestamp: timeEl?.textContent || "",
        agent: agentEl?.textContent || "main",
        content: textEl?.textContent || ""
      });
    });
    return blocks;
  }
  function extractToolCalls(sessionId) {
    const calls = [];
    const toolsContent = document.getElementById("tools-content");
    if (!toolsContent) return calls;
    const entries = toolsContent.querySelectorAll(".tool-entry");
    entries.forEach((entry) => {
      const el = entry;
      if (sessionId && sessionId !== "all" && el.dataset.session !== sessionId) {
        return;
      }
      const timeEl = el.querySelector(".tool-time");
      const agentEl = el.querySelector(".tool-agent");
      const nameEl = el.querySelector(".tool-name");
      const inputEl = el.querySelector(".tool-input-content");
      const durationEl = el.querySelector(".tool-duration");
      calls.push({
        timestamp: timeEl?.textContent || "",
        agent: agentEl?.textContent || "main",
        toolName: nameEl?.textContent || "",
        input: inputEl?.textContent || "",
        duration: durationEl?.textContent || void 0
      });
    });
    return calls;
  }
  function extractHooks(sessionId) {
    const hooks = [];
    const hooksContent = document.getElementById("hooks-content");
    if (!hooksContent) return hooks;
    const entries = hooksContent.querySelectorAll(".hook-entry");
    entries.forEach((entry) => {
      const el = entry;
      if (sessionId && sessionId !== "all" && el.dataset.session !== sessionId) {
        return;
      }
      const timeEl = el.querySelector(".hook-time");
      const typeEl = el.querySelector(".hook-type");
      const toolEl = el.querySelector(".hook-tool");
      const decisionEl = el.querySelector(".hook-decision");
      const nameEl = el.querySelector(".hook-name");
      const outputEl = el.querySelector(".hook-output");
      hooks.push({
        timestamp: timeEl?.textContent || "",
        hookType: typeEl?.textContent || "",
        toolName: toolEl?.textContent || void 0,
        decision: decisionEl?.textContent || void 0,
        hookName: nameEl?.textContent || "",
        output: outputEl?.textContent || void 0
      });
    });
    return hooks;
  }
  function extractPlanData() {
    if (!state.currentPlanPath) return null;
    const plan = state.plans.get(state.currentPlanPath);
    if (!plan) return null;
    return {
      filename: plan.filename,
      path: plan.path,
      content: plan.content
    };
  }
  function formatAsMarkdown(data) {
    const lines = [];
    const exportDate = formatLocalTime((/* @__PURE__ */ new Date()).toISOString());
    lines.push("# Thinking Monitor Export");
    lines.push("");
    lines.push("## Session Information");
    lines.push("");
    if (data.session) {
      lines.push(`- **Session ID**: \`${data.sessionId || "unknown"}\``);
      if (data.session.workingDirectory) {
        lines.push(`- **Working Directory**: \`${data.session.workingDirectory}\``);
      }
      lines.push(`- **Start Time**: ${formatLocalTime(data.session.startTime)}`);
      if (data.session.endTime) {
        lines.push(`- **End Time**: ${formatLocalTime(data.session.endTime)}`);
      }
      lines.push(`- **Status**: ${data.session.active ? "Active" : "Ended"}`);
    } else {
      lines.push("_No session selected or session data unavailable._");
    }
    lines.push(`- **Export Date**: ${exportDate}`);
    lines.push("");
    if (data.thinkingBlocks.length > 0) {
      lines.push("## Thinking Blocks");
      lines.push("");
      data.thinkingBlocks.forEach((block, index) => {
        lines.push(`### Thinking ${index + 1}`);
        lines.push(`- **Time**: ${block.timestamp}`);
        lines.push(`- **Agent**: ${block.agent}`);
        lines.push("");
        lines.push("```");
        lines.push(block.content);
        lines.push("```");
        lines.push("");
      });
    }
    if (data.toolCalls.length > 0) {
      lines.push("## Tool Calls");
      lines.push("");
      data.toolCalls.forEach((call, index) => {
        lines.push(`### ${index + 1}. ${call.toolName}`);
        lines.push(`- **Time**: ${call.timestamp}`);
        lines.push(`- **Agent**: ${call.agent}`);
        if (call.duration) {
          lines.push(`- **Duration**: ${call.duration}`);
        }
        lines.push("");
        lines.push("**Input:**");
        lines.push("");
        const inputPreview = call.input.length > 2e3 ? call.input.slice(0, 2e3) + "\n... (truncated)" : call.input;
        lines.push("```");
        lines.push(inputPreview);
        lines.push("```");
        lines.push("");
      });
    }
    if (data.hooks.length > 0) {
      lines.push("## Hook Executions");
      lines.push("");
      lines.push("| Time | Type | Tool | Decision | Hook Name |");
      lines.push("|------|------|------|----------|-----------|");
      data.hooks.forEach((hook) => {
        const tool = hook.toolName || "-";
        const decision = hook.decision || "-";
        lines.push(`| ${hook.timestamp} | ${hook.hookType} | ${tool} | ${decision} | ${hook.hookName} |`);
      });
      lines.push("");
    }
    if (data.plan) {
      lines.push("## Active Plan");
      lines.push("");
      lines.push(`- **Filename**: ${data.plan.filename}`);
      lines.push(`- **Path**: \`${data.plan.path}\``);
      lines.push("");
      lines.push("### Plan Content");
      lines.push("");
      lines.push(data.plan.content);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
    lines.push("_Generated by Thinking Monitor_");
    lines.push("");
    return lines.join("\n");
  }

  // src/dashboard/ui/export-modal.ts
  var callbacks14 = null;
  var modalElement2 = null;
  var isOpen3 = false;
  var previouslyFocused4 = null;
  var currentDirectory = "";
  var parentDirectory = null;
  var exportOptions = {
    includeThinking: true,
    includeTools: true,
    includeHooks: true
  };
  function initExportModal(cbs) {
    callbacks14 = cbs;
  }
  function createModal3() {
    const backdrop = document.createElement("div");
    backdrop.className = "export-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "export-modal-title");
    const modal = document.createElement("div");
    modal.className = "export-modal";
    const header = document.createElement("div");
    header.className = "export-modal-header";
    const title = document.createElement("h3");
    title.id = "export-modal-title";
    title.className = "export-modal-title";
    title.textContent = "Export as Markdown";
    const closeBtn = document.createElement("button");
    closeBtn.className = "export-modal-close";
    closeBtn.setAttribute("aria-label", "Close export modal");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeExportModal);
    header.appendChild(title);
    header.appendChild(closeBtn);
    const body = document.createElement("div");
    body.className = "export-modal-body";
    const description = document.createElement("p");
    description.className = "export-modal-description";
    description.textContent = "Export the current session data as a formatted markdown file.";
    const optionsSection = document.createElement("div");
    optionsSection.className = "export-options-section";
    const optionsLabel = document.createElement("label");
    optionsLabel.className = "export-modal-label";
    optionsLabel.textContent = "Include:";
    const optionsGrid = document.createElement("div");
    optionsGrid.className = "export-options-grid";
    const optionItems = [
      { id: "thinking", label: "Thinking blocks", key: "includeThinking" },
      { id: "tools", label: "Tool calls", key: "includeTools" },
      { id: "hooks", label: "Hooks", key: "includeHooks" }
    ];
    optionItems.forEach((opt) => {
      const item = document.createElement("label");
      item.className = "export-option-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `export-option-${opt.id}`;
      checkbox.checked = exportOptions[opt.key];
      checkbox.addEventListener("change", () => {
        exportOptions[opt.key] = checkbox.checked;
      });
      const labelText = document.createElement("span");
      labelText.textContent = opt.label;
      item.appendChild(checkbox);
      item.appendChild(labelText);
      optionsGrid.appendChild(item);
    });
    optionsSection.appendChild(optionsLabel);
    optionsSection.appendChild(optionsGrid);
    const browserSection = document.createElement("div");
    browserSection.className = "export-browser-section";
    const browserHeader = document.createElement("div");
    browserHeader.className = "export-browser-header";
    const pathLabel = document.createElement("label");
    pathLabel.className = "export-modal-label";
    pathLabel.textContent = "Location:";
    const pathDisplay = document.createElement("div");
    pathDisplay.className = "export-browser-path";
    pathDisplay.id = "export-browser-path";
    browserHeader.appendChild(pathLabel);
    browserHeader.appendChild(pathDisplay);
    const browserList = document.createElement("div");
    browserList.className = "export-browser-list";
    browserList.id = "export-browser-list";
    browserSection.appendChild(browserHeader);
    browserSection.appendChild(browserList);
    const inputGroup = document.createElement("div");
    inputGroup.className = "export-modal-input-group";
    const label = document.createElement("label");
    label.className = "export-modal-label";
    label.htmlFor = "export-filename-input";
    label.textContent = "Filename:";
    const inputWrapper = document.createElement("div");
    inputWrapper.className = "export-filename-wrapper";
    const input = document.createElement("input");
    input.type = "text";
    input.id = "export-filename-input";
    input.className = "export-modal-input";
    input.placeholder = "session-export";
    input.autocomplete = "off";
    input.spellcheck = false;
    const extension = document.createElement("span");
    extension.className = "export-filename-extension";
    extension.textContent = ".md";
    inputWrapper.appendChild(input);
    inputWrapper.appendChild(extension);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        handleExport();
      }
    });
    const hint = document.createElement("p");
    hint.className = "export-modal-hint";
    hint.textContent = "Files are saved as markdown (.md)";
    inputGroup.appendChild(label);
    inputGroup.appendChild(inputWrapper);
    inputGroup.appendChild(hint);
    const sessionInfo = document.createElement("div");
    sessionInfo.className = "export-modal-session-info";
    sessionInfo.id = "export-session-info";
    body.appendChild(description);
    body.appendChild(optionsSection);
    body.appendChild(browserSection);
    body.appendChild(inputGroup);
    body.appendChild(sessionInfo);
    const footer = document.createElement("div");
    footer.className = "export-modal-footer";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", closeExportModal);
    const exportBtn = document.createElement("button");
    exportBtn.className = "btn btn-primary";
    exportBtn.id = "export-modal-submit";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", handleExport);
    footer.appendChild(cancelBtn);
    footer.appendChild(exportBtn);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeExportModal();
      }
    });
    return backdrop;
  }
  async function browseDirectory(path) {
    const listEl = document.getElementById("export-browser-list");
    const pathEl = document.getElementById("export-browser-path");
    if (!listEl || !pathEl) return;
    listEl.innerHTML = '<div class="export-browser-loading">Loading...</div>';
    try {
      const response = await fetch(
        `http://localhost:3355/api/browse?path=${encodeURIComponent(path)}`
      );
      const data = await response.json();
      if (!data.success) {
        listEl.innerHTML = `<div class="export-browser-error">${escapeHtml2(data.error || "Failed to browse directory")}</div>`;
        return;
      }
      currentDirectory = data.path || path;
      parentDirectory = data.parent || null;
      pathEl.textContent = currentDirectory;
      pathEl.title = currentDirectory;
      let html = "";
      if (parentDirectory) {
        html += `<button class="export-browser-item export-browser-parent" data-path="${escapeAttr(parentDirectory)}" data-type="directory">
        <span class="export-browser-icon">&#8593;</span>
        <span class="export-browser-name">..</span>
      </button>`;
      }
      const entries = data.entries || [];
      for (const entry of entries) {
        const fullPath = `${currentDirectory}/${entry.name}`;
        const icon = entry.type === "directory" ? "&#128193;" : "&#128196;";
        const itemClass = entry.type === "directory" ? "export-browser-folder" : "export-browser-file";
        html += `<button class="export-browser-item ${itemClass}" data-path="${escapeAttr(fullPath)}" data-type="${entry.type}" data-name="${escapeAttr(entry.name)}">
        <span class="export-browser-icon">${icon}</span>
        <span class="export-browser-name">${escapeHtml2(entry.name)}</span>
      </button>`;
      }
      if (entries.length === 0 && !parentDirectory) {
        html += '<div class="export-browser-empty">No folders or .md files</div>';
      } else if (entries.length === 0) {
        html += '<div class="export-browser-empty">Empty directory</div>';
      }
      listEl.innerHTML = html;
      const items = listEl.querySelectorAll(".export-browser-item");
      items.forEach((item) => {
        item.addEventListener("click", handleBrowserItemClick);
      });
    } catch (error) {
      console.error("[Export] Browse error:", error);
      listEl.innerHTML = '<div class="export-browser-error">Failed to connect to server</div>';
    }
  }
  function handleBrowserItemClick(event) {
    const target = event.currentTarget;
    const path = target.dataset.path;
    const type = target.dataset.type;
    const name = target.dataset.name;
    if (!path) return;
    if (type === "directory") {
      browseDirectory(path);
    } else if (type === "file" && name) {
      const input = document.getElementById("export-filename-input");
      if (input && name.endsWith(".md")) {
        input.value = name.slice(0, -3);
        input.focus();
      }
    }
  }
  function escapeHtml2(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function updateSessionInfo() {
    const infoEl = document.getElementById("export-session-info");
    if (!infoEl) return;
    const sessionId = state.selectedSession !== "all" ? state.selectedSession : state.currentSessionId;
    const session = sessionId ? state.sessions.get(sessionId) : null;
    const thinkingCount = document.querySelectorAll(
      sessionId && sessionId !== "all" ? `.thinking-entry[data-session="${sessionId}"]` : ".thinking-entry"
    ).length;
    const toolCount = document.querySelectorAll(
      sessionId && sessionId !== "all" ? `.tool-entry[data-session="${sessionId}"]` : ".tool-entry"
    ).length;
    const hookCount = document.querySelectorAll(
      sessionId && sessionId !== "all" ? `.hook-entry[data-session="${sessionId}"]` : ".hook-entry"
    ).length;
    let html = '<div class="export-stats">';
    html += '<span class="export-stat-label">Data to export:</span>';
    html += '<div class="export-stat-items">';
    html += `<span class="export-stat">${thinkingCount} thinking blocks</span>`;
    html += `<span class="export-stat">${toolCount} tool calls</span>`;
    html += `<span class="export-stat">${hookCount} hooks</span>`;
    html += "</div>";
    html += "</div>";
    if (session) {
      html += `<div class="export-session-name">Session: ${escapeHtml2(session.workingDirectory || sessionId?.slice(0, 8) || "unknown")}</div>`;
    } else if (state.selectedSession === "all") {
      html += '<div class="export-session-name">Exporting all sessions</div>';
    }
    infoEl.innerHTML = html;
  }
  function getFullExportPath() {
    const input = document.getElementById("export-filename-input");
    if (!input) return "";
    const filename = input.value.trim();
    if (!filename) return "";
    const fullFilename = filename.endsWith(".md") ? filename : `${filename}.md`;
    return `${currentDirectory}/${fullFilename}`;
  }
  async function handleExport() {
    const input = document.getElementById("export-filename-input");
    const submitBtn = document.getElementById("export-modal-submit");
    if (!input || !submitBtn) return;
    const filename = input.value.trim();
    if (!filename) {
      if (callbacks14) {
        callbacks14.showToast("Please enter a filename", "error");
      }
      input.focus();
      return;
    }
    if (/[/\\:*?"<>|]/.test(filename)) {
      if (callbacks14) {
        callbacks14.showToast("Filename contains invalid characters", "error");
      }
      input.focus();
      return;
    }
    const path = getFullExportPath();
    if (!path) {
      if (callbacks14) {
        callbacks14.showToast("Invalid export path", "error");
      }
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Exporting...";
    try {
      const data = extractSessionData(exportOptions);
      const markdown = formatAsMarkdown(data);
      const response = await fetch("http://localhost:3355/export-markdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: markdown })
      });
      const result = await response.json();
      if (result.success) {
        if (callbacks14) {
          callbacks14.showToast(`Exported to ${result.path}`, "success", 5e3);
          callbacks14.announceStatus("Export successful");
        }
        closeExportModal();
        if (result.path) {
          try {
            const revealResponse = await fetch("http://localhost:3355/api/reveal-file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: result.path })
            });
            const revealResult = await revealResponse.json();
            if (!revealResult.success) {
              console.warn("[Export] Failed to reveal file:", revealResult.error);
            }
          } catch (revealError) {
            console.warn("[Export] Failed to reveal file:", revealError);
          }
        }
      } else {
        if (callbacks14) {
          callbacks14.showToast(result.error || "Export failed", "error");
        }
      }
    } catch (error) {
      console.error("[Export] Failed:", error);
      if (callbacks14) {
        callbacks14.showToast("Export failed. Check console for details.", "error");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Export";
    }
  }
  function getInitialDirectory() {
    const sessionId = state.selectedSession !== "all" ? state.selectedSession : state.currentSessionId;
    const session = sessionId ? state.sessions.get(sessionId) : null;
    if (session?.workingDirectory) {
      return session.workingDirectory;
    }
    return "~";
  }
  function getSuggestedFilename() {
    const sessionId = state.selectedSession !== "all" ? state.selectedSession : state.currentSessionId;
    const now = /* @__PURE__ */ new Date();
    const timestamp = now.toISOString().split("T")[0];
    if (sessionId && sessionId !== "all") {
      return `session-${sessionId.slice(0, 8)}-${timestamp}`;
    }
    return `thinking-export-${timestamp}`;
  }
  function openExportModal() {
    if (isOpen3) return;
    if (!modalElement2) {
      modalElement2 = createModal3();
      document.body.appendChild(modalElement2);
    }
    const input = document.getElementById("export-filename-input");
    if (input) {
      input.value = getSuggestedFilename();
    }
    updateSessionInfo();
    previouslyFocused4 = document.activeElement;
    modalElement2.classList.add("visible");
    isOpen3 = true;
    const initialDir = getInitialDirectory();
    browseDirectory(initialDir);
    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 100);
    }
    document.addEventListener("keydown", handleModalKeydown2);
  }
  function closeExportModal() {
    if (!isOpen3 || !modalElement2) return;
    modalElement2.classList.remove("visible");
    isOpen3 = false;
    document.removeEventListener("keydown", handleModalKeydown2);
    if (previouslyFocused4 && previouslyFocused4.focus) {
      previouslyFocused4.focus();
      previouslyFocused4 = null;
    }
  }
  function handleModalKeydown2(event) {
    if (event.key === "Escape") {
      closeExportModal();
      return;
    }
    if (event.key === "Tab" && modalElement2) {
      const focusable = modalElement2.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }
  function isExportAllowed() {
    return state.selectedSession !== "all";
  }
  function updateExportButtonState() {
    const exportBtn = elements.exportBtn;
    if (!exportBtn) return;
    const allowed = isExportAllowed();
    if (allowed) {
      exportBtn.disabled = false;
      exportBtn.title = "Export as Markdown (Cmd+E)";
      exportBtn.classList.remove("btn-disabled");
    } else {
      exportBtn.disabled = true;
      exportBtn.title = "Select a session to export";
      exportBtn.classList.add("btn-disabled");
    }
  }
  function tryOpenExportModal() {
    if (!isExportAllowed()) {
      if (callbacks14) {
        callbacks14.showToast("Select a session to export", "info");
      }
      return false;
    }
    openExportModal();
    return true;
  }

  // src/dashboard/ui/empty-states.ts
  function getEmptyStateContext() {
    return {
      connected: state.connected,
      hasSession: state.currentSessionId !== null,
      sessionCount: state.sessions.size,
      selectedSession: state.selectedSession
    };
  }
  function getEmptyStateHTML(panel, ctx) {
    const context = ctx || getEmptyStateContext();
    switch (panel) {
      case "thinking":
        if (!context.connected) {
          return emptyState("&#129504;", "Waiting for connection...", "Connect to the Thinking Monitor server to see Claude's thoughts.");
        }
        if (!context.hasSession) {
          return emptyState("&#129504;", "Waiting for Claude Code session...", "Start a conversation in your terminal to see thinking blocks.");
        }
        return emptyState("&#129504;", "Waiting for thinking...", "Claude's extended thinking will appear here as it reasons through problems.");
      case "tools":
        if (!context.connected) {
          return emptyState("&#128295;", "Waiting for connection...", "Connect to see tool activity.");
        }
        return emptyState("&#128295;", "No tool calls yet", "Tools appear when Claude reads files, runs commands, edits code, or searches.");
      case "hooks":
        return emptyState("&#9881;", "No hook activity", "Hooks run before/after tool execution to enforce rules and track behavior.");
      case "plan":
        if (context.hasSession) {
          return emptyState(
            "&#128196;",
            "No plan for this session",
            'Plans appear when Claude enters plan mode.<div class="empty-state-shortcuts"><kbd>Cmd+O</kbd> Open &nbsp; <kbd>Cmd+Shift+R</kbd> Reveal</div>'
          );
        }
        return emptyState("&#128196;", "No plan loaded", "Select a plan from the dropdown above.");
      case "team":
        return emptyState("&#128101;", "No team activity", "Teams appear when Claude uses TeamCreate and SendMessage for multi-agent collaboration.");
      case "tasks":
        return emptyState("&#128203;", "No task activity", "Task boards appear when Claude creates and manages tasks for team coordination.");
      case "timeline":
        return emptyState("&#128337;", "No events yet", "A chronological feed of all events: thinking, tools, hooks, agents, and more.");
      case "agents":
        return emptyState("&#129302;", "No agents", "Sub-agents will appear here when Claude spawns them.");
      default:
        return emptyState("&#9679;", "No data", "Waiting for events...");
    }
  }
  function emptyState(icon, title, subtitle) {
    return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <p class="empty-state-title">${title}</p>
      <p class="empty-state-subtitle">${subtitle}</p>
    </div>
  `;
  }

  // src/dashboard/app.ts
  function announceStatus(message) {
    const announcer = document.getElementById("status-announcer");
    if (announcer) {
      announcer.textContent = "";
      requestAnimationFrame(() => {
        announcer.textContent = message;
      });
    }
  }
  function focusActivePanel(view) {
    const panelMap = {
      thinking: "thinking-content",
      tools: "tools-content",
      hooks: "hooks-content",
      plan: "plan-content",
      team: "team-content",
      tasks: "tasks-content",
      timeline: "timeline-entries",
      agents: "agents-detail"
    };
    const panelId = panelMap[view];
    if (panelId) {
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.setAttribute("tabindex", "-1");
        panel.focus();
      }
    }
  }
  function showToast(message, type = "info", duration = 3e3) {
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast-stacked toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("toast-out");
      setTimeout(() => toast.remove(), 100);
    }, duration);
  }
  function isNearBottom(container) {
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  }
  function smartScroll(container) {
    if (state.autoScroll && !state.userScrolledUp) {
      container.scrollTop = container.scrollHeight;
    }
  }
  function handlePanelScroll(container) {
    state.userScrolledUp = !isNearBottom(container);
  }
  function appendAndTrim(container, element) {
    container.appendChild(element);
    const children = container.children;
    while (children.length > MAX_ENTRIES) {
      children[0].remove();
    }
  }
  function clearAllPanels() {
    state.eventCount = 0;
    state.thinkingCount = 0;
    state.toolsCount = 0;
    state.hooksCount = 0;
    state.agentsCount = 0;
    state.agents.clear();
    state.pendingTools.clear();
    state.sessions.clear();
    state.currentSessionId = null;
    state.selectedSession = "all";
    state.userScrolledUp = false;
    agentContextStack.length = 0;
    agentContextStack.push("main");
    agentContextTimestamps.clear();
    state.sessionPlanMap.clear();
    updateSessionFilter();
    updateStatusBarSession();
    teamState.teams.clear();
    teamState.teamTasks.clear();
    teamState.teamMessages = [];
    state.selectedAgentId = null;
    elements.eventCount.textContent = "Events: 0";
    elements.thinkingCount.textContent = "0";
    elements.toolsCount.textContent = "0";
    if (elements.hooksCount) {
      elements.hooksCount.textContent = "0";
    }
    if (elements.timelineCount) {
      elements.timelineCount.textContent = "0";
    }
    resetTypeChips();
    state.thinkingFilter = "";
    state.toolsFilter = "";
    elements.thinkingFilter.value = "";
    elements.toolsFilter.value = "";
    elements.thinkingFilterClear.classList.add("panel-filter-hidden");
    elements.toolsFilterClear.classList.add("panel-filter-hidden");
    elements.thinkingContent.innerHTML = getEmptyStateHTML("thinking");
    elements.toolsContent.innerHTML = getEmptyStateHTML("tools");
    if (elements.hooksContent) {
      elements.hooksContent.innerHTML = getEmptyStateHTML("hooks");
    }
    resetHistogram();
    resetStats();
    resetAgentsView();
    showToast("Panels cleared", "info");
    announceStatus("All panels cleared");
    updateExportButtonState();
  }
  elements.connectionOverlayRetry.addEventListener("click", retryNow);
  elements.exportBtn.addEventListener("click", tryOpenExportModal);
  elements.autoScrollCheckbox.addEventListener("change", () => {
    state.autoScroll = elements.autoScrollCheckbox.checked;
    state.userScrolledUp = false;
  });
  elements.thinkingContent.addEventListener("scroll", () => {
    handlePanelScroll(elements.thinkingContent);
  });
  elements.toolsContent.addEventListener("scroll", () => {
    handlePanelScroll(elements.toolsContent);
  });
  elements.thinkingFilter.addEventListener("input", () => {
    state.thinkingFilter = elements.thinkingFilter.value;
    filterAllThinking();
  });
  elements.thinkingFilterClear.addEventListener("click", () => {
    state.thinkingFilter = "";
    elements.thinkingFilter.value = "";
    filterAllThinking();
    elements.thinkingFilter.focus();
  });
  elements.toolsFilter.addEventListener("input", () => {
    state.toolsFilter = elements.toolsFilter.value;
    filterAllTools();
  });
  elements.toolsFilterClear.addEventListener("click", () => {
    state.toolsFilter = "";
    elements.toolsFilter.value = "";
    filterAllTools();
    elements.toolsFilter.focus();
  });
  document.addEventListener("mousedown", () => {
    state.keyboardMode = false;
    document.body.classList.remove("keyboard-mode");
  });
  elements.planSelectorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlanSelector();
  });
  document.addEventListener("click", (e) => {
    if (state.planSelectorOpen) {
      const target = e.target;
      if (!elements.planSelectorBtn?.contains(target) && !elements.planSelectorDropdown?.contains(target)) {
        closePlanSelector();
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.planSelectorOpen) {
      closePlanSelector();
    }
  });
  window.addEventListener("resize", () => {
    if (state.planSelectorOpen) {
      closePlanSelector();
    }
  });
  elements.planOpenBtn.addEventListener("click", handlePlanOpenClick);
  elements.planRevealBtn.addEventListener("click", handlePlanRevealClick);
  elements.planContent.addEventListener("contextmenu", handlePlanContextMenu);
  elements.planSelectorBtn.addEventListener("contextmenu", handlePlanContextMenu);
  elements.toolsContent.addEventListener("contextmenu", (e) => {
    const target = e.target;
    const filePathEl = target.closest(".tool-file-path");
    if (filePathEl) {
      e.preventDefault();
      const path = filePathEl.dataset.path;
      if (path) {
        showFileContextMenu(e.clientX, e.clientY, path);
      }
    }
  });
  elements.contextMenuOpen.addEventListener("click", handleContextMenuOpen);
  elements.contextMenuReveal.addEventListener("click", handleContextMenuReveal);
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!elements.planContextMenu?.contains(target)) {
      hidePlanContextMenu();
    }
    if (elements.sessionContextMenu && !elements.sessionContextMenu.contains(target)) {
      hideSessionContextMenu();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hidePlanContextMenu();
      hideSessionContextMenu();
    }
  });
  if (elements.sessionContextMenuReveal) {
    elements.sessionContextMenuReveal.addEventListener("click", handleRevealSessionInFinder);
  }
  restorePanelCollapseState();
  restorePanelVisibility();
  loadSessionPlanAssociations();
  var savedTheme = loadThemePreference();
  initThemeToggle(savedTheme);
  if (state.sessions.size > 0) {
    updateSessionFilter();
  }
  if (state.selectedSession === "all") {
    elements.planPanel?.classList.add("session-hidden");
    elements.teamPanel?.classList.add("session-hidden");
    elements.tasksPanel?.classList.add("session-hidden");
  }
  initThinking({
    getCurrentAgentContext,
    getAgentDisplayName,
    appendAndTrim,
    smartScroll
  });
  initTools({
    getCurrentAgentContext,
    getAgentDisplayName,
    detectSendMessage: (input, agentId, timestamp) => {
      if (!input) return;
      try {
        const parsed = JSON.parse(input);
        const msgType = parsed.type || "message";
        const sender = agentId || "unknown";
        const recipient = parsed.recipient || (msgType === "broadcast" ? "all" : "unknown");
        const summary = parsed.summary || parsed.content?.slice(0, 80) || "";
        handleMessageSent({
          type: "message_sent",
          timestamp,
          sender,
          recipient,
          messageType: msgType,
          summary
        });
      } catch {
      }
    },
    appendAndTrim,
    smartScroll
  });
  initSessions({
    displayPlan,
    displayEmptyPlan,
    displaySessionPlanEmpty,
    showToast,
    updateExportButtonState,
    clearAllPanels,
    setStatsSource
  });
  initPlans({
    findActiveAgent,
    showToast,
    announceStatus
  });
  initHooks({
    appendAndTrim,
    smartScroll
  });
  initTeam({
    appendAndTrim,
    smartScroll,
    showTeamPanel: () => {
      if (elements.teamPanel?.classList.contains("panel-hidden")) {
        elements.teamPanel.classList.remove("panel-hidden");
      }
    }
  });
  initTasks({
    showTasksPanel: () => {
      if (elements.tasksPanel?.classList.contains("panel-hidden")) {
        elements.tasksPanel.classList.remove("panel-hidden");
      }
    }
  });
  initTimeline({
    appendAndTrim,
    smartScroll
  });
  initAgentsView();
  initDurationHistogram();
  initViews({
    announceStatus,
    focusActivePanel,
    togglePanelSelector
  });
  initPanels({
    announceStatus
  });
  initKeyboard({
    clearAllPanels,
    handlePlanOpenClick,
    handlePlanRevealClick,
    togglePanelSelector,
    tryOpenExportModal
  });
  initPanelSelector({
    announceStatus
  });
  initExportModal({
    showToast,
    announceStatus
  });
  initViewTabs();
  if (state.selectedSession === "all") {
    updateSessionViewTabs(true);
  }
  updateExportButtonState();
  initPanelCollapseButtons();
  applyAllPanelVisibility();
  initResizers();
  initDragReorder();
  initTooltip();
  initSearchOverlay();
  initStatsBar();
  initStatusBarSession();
  initWebSocket({
    onEvent: (event) => {
      activityTracker.timestamps.push(Date.now());
      handleEvent(event);
    },
    showToast,
    announceStatus
  });
  connect();
  var ACTIVITY_WINDOW_MS = 6e4;
  var ACTIVITY_UPDATE_INTERVAL_MS = 2e3;
  var ACTIVITY_IDLE_THRESHOLD_MS = 1e4;
  setInterval(() => {
    renderStats();
    const now = Date.now();
    const cutoff = now - ACTIVITY_WINDOW_MS;
    while (activityTracker.headIndex < activityTracker.timestamps.length && activityTracker.timestamps[activityTracker.headIndex] < cutoff) {
      activityTracker.headIndex++;
    }
    if (activityTracker.headIndex > 512 && activityTracker.headIndex > activityTracker.timestamps.length / 2) {
      activityTracker.timestamps.splice(0, activityTracker.headIndex);
      activityTracker.headIndex = 0;
    }
    const activeEventCount = activityTracker.timestamps.length - activityTracker.headIndex;
    activityTracker.eventsPerSec = activeEventCount / (ACTIVITY_WINDOW_MS / 1e3);
    const pulseEl = document.getElementById("activity-pulse");
    const dotEl = pulseEl?.querySelector(".activity-pulse-dot");
    const rateEl = pulseEl?.querySelector(".activity-pulse-rate");
    if (pulseEl && dotEl && rateEl) {
      const lastTimestamp = activeEventCount > 0 ? activityTracker.timestamps[activityTracker.timestamps.length - 1] || 0 : 0;
      const isIdle = now - lastTimestamp > ACTIVITY_IDLE_THRESHOLD_MS;
      if (isIdle) {
        dotEl.classList.remove("active");
        dotEl.classList.add("idle");
        rateEl.textContent = "";
      } else {
        dotEl.classList.remove("idle");
        dotEl.classList.add("active");
        const rate = activityTracker.eventsPerSec;
        if (rate >= 1) {
          rateEl.textContent = `${rate.toFixed(1)}/s`;
        } else if (rate > 0) {
          rateEl.textContent = `${(rate * 60).toFixed(0)}/m`;
        } else {
          rateEl.textContent = "";
        }
      }
    }
  }, ACTIVITY_UPDATE_INTERVAL_MS);
  debug("[Dashboard] Thinking Monitor initialized");
  debug("[Dashboard] Keyboard shortcuts: t/o/d/h/p=views, Shift+t/o/d=collapse, Shift+p=panel settings, c=clear, s=scroll, /=search, Esc=clear filters");
  debug("[Dashboard] Plan shortcuts: Cmd+O=open, Cmd+Shift+R=reveal, Cmd+E=export, right-click=context menu");
})();
