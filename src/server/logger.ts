/**
 * Logger Utility for the Thinking Monitor.
 *
 * Provides configurable log levels to control output verbosity.
 * Set LOG_LEVEL environment variable to: debug, info, warn, or error.
 * Default level is 'info'.
 * Set LOG_FORMAT=json to emit structured JSON log lines.
 *
 * Usage:
 *   import { logger } from './logger.ts';
 *   logger.debug('Verbose polling info');  // Only shown when LOG_LEVEL=debug
 *   logger.info('Server started');         // Default level
 *   logger.warn('Connection rejected');    // Warnings
 *   logger.error('Fatal error', err);      // Errors
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'text' | 'json';

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
 * Get the current log format from environment variable.
 * Defaults to 'text' if not set or invalid.
 */
function getCurrentFormat(): LogFormat {
  return process.env.LOG_FORMAT?.toLowerCase() === 'json' ? 'json' : 'text';
}

const currentFormat = getCurrentFormat();

/**
 * Convert unknown values into JSON-safe structures.
 */
function toLogData(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

/**
 * Emit a log entry in configured format.
 */
function emit(level: LogLevel, method: 'log' | 'warn' | 'error', args: unknown[]): void {
  if (LEVELS[level] < LEVELS[currentLevel]) {
    return;
  }

  if (currentFormat === 'json') {
    const [first, ...rest] = args;
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof first === 'string' ? first : String(first ?? ''),
    };

    if (rest.length > 0) {
      entry.context = rest.map(toLogData);
    } else if (first !== undefined && typeof first !== 'string') {
      entry.context = [toLogData(first)];
    }

    console[method](JSON.stringify(entry));
    return;
  }

  console[method](...args);
}

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
    emit('debug', 'log', args);
  },

  /**
   * Info level - standard operational messages.
   * Use for: startup messages, connection events, significant actions.
   */
  info: (...args: unknown[]): void => {
    emit('info', 'log', args);
  },

  /**
   * Warn level - warning messages that don't stop operation.
   * Use for: rejected connections, validation failures, recoverable issues.
   */
  warn: (...args: unknown[]): void => {
    emit('warn', 'warn', args);
  },

  /**
   * Error level - error messages for failures.
   * Use for: exceptions, fatal errors, operation failures.
   */
  error: (...args: unknown[]): void => {
    emit('error', 'error', args);
  },
};
