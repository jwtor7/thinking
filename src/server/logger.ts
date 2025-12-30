/**
 * Logger Utility for the Thinking Monitor.
 *
 * Provides configurable log levels to control output verbosity.
 * Set LOG_LEVEL environment variable to: debug, info, warn, or error.
 * Default level is 'info'.
 *
 * Usage:
 *   import { logger } from './logger.ts';
 *   logger.debug('Verbose polling info');  // Only shown when LOG_LEVEL=debug
 *   logger.info('Server started');         // Default level
 *   logger.warn('Connection rejected');    // Warnings
 *   logger.error('Fatal error', err);      // Errors
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get the current log level from environment variable.
 * Defaults to 'info' if not set or invalid.
 */
function getCurrentLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LEVELS) {
    return envLevel as LogLevel;
  }
  return 'info';
}

const currentLevel = getCurrentLevel();

/**
 * Logger object with level-based filtering.
 *
 * Messages are only output if their level is >= the current log level.
 */
export const logger = {
  /**
   * Debug level - verbose output for troubleshooting.
   * Use for: per-event logs, polling info, detailed state changes.
   */
  debug: (...args: unknown[]): void => {
    if (LEVELS.debug >= LEVELS[currentLevel]) {
      console.log(...args);
    }
  },

  /**
   * Info level - standard operational messages.
   * Use for: startup messages, connection events, significant actions.
   */
  info: (...args: unknown[]): void => {
    if (LEVELS.info >= LEVELS[currentLevel]) {
      console.log(...args);
    }
  },

  /**
   * Warn level - warning messages that don't stop operation.
   * Use for: rejected connections, validation failures, recoverable issues.
   */
  warn: (...args: unknown[]): void => {
    if (LEVELS.warn >= LEVELS[currentLevel]) {
      console.warn(...args);
    }
  },

  /**
   * Error level - error messages for failures.
   * Use for: exceptions, fatal errors, operation failures.
   */
  error: (...args: unknown[]): void => {
    if (LEVELS.error >= LEVELS[currentLevel]) {
      console.error(...args);
    }
  },
};
