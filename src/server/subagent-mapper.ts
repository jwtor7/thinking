/**
 * Subagent Mapper - Server-Side Parent/Child Relationship Tracking
 *
 * Maps subagent IDs to their parent session IDs, enabling the dashboard
 * to show nested thinking from subagents under their parent sessions.
 *
 * Memory Management:
 * - Mappings are cleaned up 5 minutes after subagent stops
 * - All subagents are cleaned up immediately when parent session stops
 * - In-memory only - cleared on server restart
 */

import { logger } from './logger.ts';

/**
 * Information about a subagent and its relationship to the parent session.
 */
export interface SubagentMapping {
  /** Unique subagent identifier */
  agentId: string;
  /** Session ID of the parent session that spawned this subagent */
  parentSessionId: string;
  /** Human-readable agent name */
  agentName: string;
  /** ISO 8601 timestamp when the subagent started */
  startTime: string;
  /** Current status of the subagent */
  status: 'running' | 'success' | 'failure' | 'cancelled';
  /** ISO 8601 timestamp when the subagent stopped (if stopped) */
  endTime?: string;
  /** Cleanup timer ID for delayed removal */
  cleanupTimer?: NodeJS.Timeout;
}

/**
 * Serializable mapping info for sending to clients.
 * Excludes internal fields like cleanupTimer.
 */
export interface SubagentMappingInfo {
  agentId: string;
  parentSessionId: string;
  agentName: string;
  startTime: string;
  status: 'running' | 'success' | 'failure' | 'cancelled';
  endTime?: string;
}

/** Grace period before cleaning up stopped subagents (5 minutes) */
const CLEANUP_GRACE_PERIOD_MS = 5 * 60 * 1000;

/**
 * Maps subagent IDs to parent session IDs and tracks subagent lifecycle.
 * Singleton instance used by the event receiver.
 */
export class SubagentMapper {
  /** agentId -> SubagentMapping */
  private mappings: Map<string, SubagentMapping> = new Map();

  /** parentSessionId -> Set<agentId> */
  private sessionSubagents: Map<string, Set<string>> = new Map();

  /**
   * Register a new subagent with its parent session.
   * Called when agent_start event is received.
   *
   * @param agentId Unique subagent identifier
   * @param parentSessionId Session ID of the parent that spawned this subagent
   * @param agentName Human-readable agent name
   * @param startTime ISO 8601 timestamp when the subagent started
   */
  registerSubagent(
    agentId: string,
    parentSessionId: string,
    agentName: string,
    startTime: string
  ): void {
    // Check if this subagent is already registered
    const existing = this.mappings.get(agentId);
    if (existing) {
      // Clear any pending cleanup timer
      if (existing.cleanupTimer) {
        clearTimeout(existing.cleanupTimer);
      }
      logger.debug(
        `[SubagentMapper] Re-registering subagent: ${agentId} (name: ${agentName})`
      );
    } else {
      logger.info(
        `[SubagentMapper] Registered subagent: ${agentId} (name: ${agentName}) under session: ${parentSessionId}`
      );
    }

    // Create or update the mapping
    this.mappings.set(agentId, {
      agentId,
      parentSessionId,
      agentName,
      startTime,
      status: 'running',
    });

    // Add to session's subagent set
    let subagents = this.sessionSubagents.get(parentSessionId);
    if (!subagents) {
      subagents = new Set();
      this.sessionSubagents.set(parentSessionId, subagents);
    }
    subagents.add(agentId);
  }

  /**
   * Mark a subagent as stopped and schedule cleanup.
   * Called when agent_stop event is received.
   *
   * @param agentId Unique subagent identifier
   * @param status Exit status of the subagent
   * @param endTime ISO 8601 timestamp when the subagent stopped
   */
  stopSubagent(
    agentId: string,
    status: 'success' | 'failure' | 'cancelled',
    endTime: string
  ): void {
    const mapping = this.mappings.get(agentId);
    if (!mapping) {
      logger.debug(
        `[SubagentMapper] Stop received for unknown subagent: ${agentId}`
      );
      return;
    }

    // Update status
    mapping.status = status;
    mapping.endTime = endTime;

    logger.info(
      `[SubagentMapper] Subagent stopped: ${agentId} (status: ${status}), scheduling cleanup in ${CLEANUP_GRACE_PERIOD_MS / 1000}s`
    );

    // Schedule cleanup after grace period
    // This allows the dashboard to still show the subagent for a while after it stops
    mapping.cleanupTimer = setTimeout(() => {
      this.removeSubagent(agentId);
    }, CLEANUP_GRACE_PERIOD_MS);
  }

  /**
   * Remove a subagent from tracking.
   * Called after grace period or when parent session stops.
   *
   * @param agentId Unique subagent identifier
   */
  private removeSubagent(agentId: string): void {
    const mapping = this.mappings.get(agentId);
    if (!mapping) {
      return;
    }

    // Clear cleanup timer if set
    if (mapping.cleanupTimer) {
      clearTimeout(mapping.cleanupTimer);
    }

    // Remove from session's subagent set
    const subagents = this.sessionSubagents.get(mapping.parentSessionId);
    if (subagents) {
      subagents.delete(agentId);
      if (subagents.size === 0) {
        this.sessionSubagents.delete(mapping.parentSessionId);
      }
    }

    // Remove the mapping
    this.mappings.delete(agentId);

    logger.debug(`[SubagentMapper] Removed subagent: ${agentId}`);
  }

  /**
   * Clean up all subagents for a session.
   * Called when parent session stops.
   *
   * @param sessionId Session ID of the parent session
   */
  cleanupSessionSubagents(sessionId: string): void {
    const subagents = this.sessionSubagents.get(sessionId);
    if (!subagents || subagents.size === 0) {
      return;
    }

    logger.info(
      `[SubagentMapper] Cleaning up ${subagents.size} subagent(s) for session: ${sessionId}`
    );

    // Copy to array to avoid modification during iteration
    const agentIds = Array.from(subagents);
    for (const agentId of agentIds) {
      this.removeSubagent(agentId);
    }
  }

  /**
   * Get the parent session ID for a subagent.
   *
   * @param agentId Unique subagent identifier
   * @returns Parent session ID, or undefined if not found
   */
  getParentSession(agentId: string): string | undefined {
    return this.mappings.get(agentId)?.parentSessionId;
  }

  /**
   * Get a subagent mapping by ID.
   *
   * @param agentId Unique subagent identifier
   * @returns Subagent mapping info, or undefined if not found
   */
  getSubagent(agentId: string): SubagentMappingInfo | undefined {
    const mapping = this.mappings.get(agentId);
    if (!mapping) {
      return undefined;
    }
    // Return serializable info (exclude cleanupTimer)
    const { cleanupTimer: _, ...info } = mapping;
    return info;
  }

  /**
   * Get all subagents for a session.
   *
   * @param sessionId Session ID of the parent session
   * @returns Array of subagent mapping info
   */
  getSessionSubagents(sessionId: string): SubagentMappingInfo[] {
    const subagentIds = this.sessionSubagents.get(sessionId);
    if (!subagentIds || subagentIds.size === 0) {
      return [];
    }

    const result: SubagentMappingInfo[] = [];
    for (const agentId of subagentIds) {
      const mapping = this.mappings.get(agentId);
      if (mapping) {
        // Return serializable info (exclude cleanupTimer)
        const { cleanupTimer: _, ...info } = mapping;
        result.push(info);
      }
    }
    return result;
  }

  /**
   * Get all subagent mappings (for sending to clients on connect).
   *
   * @returns Array of all subagent mapping info
   */
  getAllMappings(): SubagentMappingInfo[] {
    const result: SubagentMappingInfo[] = [];
    for (const mapping of this.mappings.values()) {
      // Return serializable info (exclude cleanupTimer)
      const { cleanupTimer: _, ...info } = mapping;
      result.push(info);
    }
    return result;
  }

  /**
   * Check if an agent ID is a subagent (vs main session).
   *
   * @param agentId Agent ID to check
   * @returns true if this is a tracked subagent
   */
  isSubagent(agentId: string): boolean {
    return this.mappings.has(agentId);
  }

  /**
   * Clean up all resources.
   * Called on server shutdown.
   */
  destroy(): void {
    // Clear all cleanup timers
    for (const mapping of this.mappings.values()) {
      if (mapping.cleanupTimer) {
        clearTimeout(mapping.cleanupTimer);
      }
    }
    this.mappings.clear();
    this.sessionSubagents.clear();
    logger.info('[SubagentMapper] Destroyed');
  }
}
