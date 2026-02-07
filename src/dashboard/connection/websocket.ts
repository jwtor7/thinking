/**
 * WebSocket Connection Management
 *
 * Handles WebSocket connection lifecycle including:
 * - Connection establishment and teardown
 * - Automatic reconnection with exponential backoff
 * - Connection status UI updates
 * - Message handling delegation via callbacks
 */

import {
  WS_URL,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from '../config.ts';
import { state } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { debug } from '../utils/debug.ts';
import type { StrictMonitorEvent, WebSocketMessage } from '../types.ts';

// ============================================
// Types
// ============================================

/**
 * Callbacks for WebSocket events that need to be handled
 * by the main application module. This pattern avoids
 * circular dependencies while allowing the connection
 * module to delegate event handling.
 */
export interface WebSocketCallbacks {
  /** Called when a monitor event is received */
  onEvent: (event: StrictMonitorEvent) => void;
  /** Called to show toast notifications */
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  /** Called to announce status changes for screen readers */
  announceStatus: (message: string) => void;
}

// ============================================
// Module State
// ============================================

/** WebSocket connection instance */
let ws: WebSocket | null = null;

/** Timeout ID for scheduled reconnection */
let reconnectTimeout: number | null = null;

/** Interval ID for countdown display updates */
let countdownInterval: number | null = null;

/** Stored callbacks for event delegation */
let callbacks: WebSocketCallbacks | null = null;

// ============================================
// Initialization
// ============================================

/**
 * Initialize the WebSocket module with callbacks.
 * Must be called before connect() to set up event handlers.
 *
 * @param cbs - Callback functions for event handling
 */
export function initWebSocket(cbs: WebSocketCallbacks): void {
  callbacks = cbs;
}

// ============================================
// Connection Management
// ============================================

/**
 * Establish WebSocket connection to the monitor server.
 * Handles connection lifecycle events and delegates message
 * handling to the configured callbacks.
 *
 * Connection is idempotent - calling while already connected
 * or connecting is a no-op.
 */
export function connect(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  updateConnectionStatus('connecting');
  hideConnectionOverlay();

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    debug('[Dashboard] Connected to monitor server');
    state.connected = true;
    state.reconnectAttempt = 0;
    updateConnectionStatus('connected');
    hideConnectionOverlay();
    callbacks?.showToast('Connected to server', 'success');

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
    debug('[Dashboard] Disconnected from monitor server');
    state.connected = false;
    updateConnectionStatus('disconnected');
    callbacks?.showToast('Connection lost', 'error');
    scheduleReconnect();
  };

  ws.onerror = (error) => {
    console.error('[Dashboard] WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      // Server validates events with isMonitorEvent before broadcast,
      // so we can safely cast to StrictMonitorEvent for type-safe handling
      callbacks?.onEvent(message.event as StrictMonitorEvent);
    } catch (error) {
      console.error('[Dashboard] Failed to parse message:', error);
    }
  };
}

/**
 * Get the current WebSocket instance.
 * Useful for checking connection state or sending messages.
 *
 * @returns The WebSocket instance or null if not connected
 */
export function getWebSocket(): WebSocket | null {
  return ws;
}

/**
 * Send a message through the WebSocket connection.
 *
 * @param data - Data to send (will be JSON stringified)
 * @returns true if message was sent, false if connection unavailable
 */
export function sendMessage(data: unknown): boolean {
  if (ws?.readyState !== WebSocket.OPEN) {
    console.warn('[Dashboard] Cannot send message: WebSocket not connected');
    return false;
  }
  ws.send(JSON.stringify(data));
  return true;
}

// ============================================
// Reconnection Logic
// ============================================

/**
 * Schedule a reconnection attempt with exponential backoff.
 * Includes jitter to prevent thundering herd on server restart.
 */
function scheduleReconnect(): void {
  if (reconnectTimeout) {
    return;
  }

  state.reconnectAttempt++;

  // Exponential backoff with jitter
  const baseDelay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, state.reconnectAttempt - 1),
    RECONNECT_MAX_DELAY_MS
  );
  const jitter = Math.random() * 1000;
  const delay = baseDelay + jitter;

  state.reconnectCountdown = Math.ceil(delay / 1000);
  showConnectionOverlay();
  updateReconnectCountdown();

  countdownInterval = window.setInterval(() => {
    state.reconnectCountdown--;
    updateReconnectCountdown();
    if (state.reconnectCountdown <= 0 && countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);

  reconnectTimeout = window.setTimeout(() => {
    reconnectTimeout = null;
    debug('[Dashboard] Attempting to reconnect...');
    connect();
  }, delay);
}

/**
 * Immediately attempt reconnection, cancelling any pending scheduled attempt.
 * Called when user clicks the "Retry Now" button.
 */
export function retryNow(): void {
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

// ============================================
// UI Updates
// ============================================

/**
 * Update the reconnection countdown display in the overlay
 * and status indicator.
 */
function updateReconnectCountdown(): void {
  elements.connectionOverlayMessage.textContent =
    `Reconnecting in ${state.reconnectCountdown}s... (attempt ${state.reconnectAttempt})`;

  // Update status indicator with countdown
  const statusText = elements.connectionStatus.querySelector('.status-text');
  if (statusText && !state.connected) {
    statusText.innerHTML = `Reconnecting <span class="reconnect-countdown">${state.reconnectCountdown}s</span>`;
  }
}

/**
 * Show the connection overlay (displayed when disconnected).
 */
function showConnectionOverlay(): void {
  elements.connectionOverlay.classList.add('visible');
}

/**
 * Hide the connection overlay.
 */
function hideConnectionOverlay(): void {
  elements.connectionOverlay.classList.remove('visible');
}

/**
 * Update the connection status indicator in the header.
 *
 * @param status - Current connection status
 */
function updateConnectionStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
  const statusEl = elements.connectionStatus;
  statusEl.className = `status status-${status}`;

  let statusText = 'Disconnected';
  if (status === 'connected') {
    statusText = 'Connected';
  } else if (status === 'connecting') {
    statusText = 'Connecting...';
  }

  const textEl = statusEl.querySelector('.status-text');
  if (textEl) {
    textEl.textContent = statusText;
  }

  // Announce connection status change for screen readers (only significant changes)
  if (status === 'connected' || status === 'disconnected') {
    callbacks?.announceStatus(status === 'connected' ? 'Connected to server' : 'Disconnected from server');
  }
}
