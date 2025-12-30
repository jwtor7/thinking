/**
 * File Actions Handler for the Thinking Monitor.
 *
 * Provides secure file operations for the dashboard:
 * - Open files in default application
 * - Reveal files in file manager (Finder/Explorer/etc.)
 *
 * Cross-platform support:
 * - macOS: uses `open` command
 * - Windows: uses `explorer` command
 * - Linux: uses `xdg-open` command
 *
 * Security:
 * - Localhost-only binding ensures only local access
 * - Validates path is absolute and doesn't contain traversal patterns
 * - Uses spawn with argument array (no shell injection possible)
 * - No sensitive operations (read/write/delete) - only open/reveal
 */

import { spawn } from 'node:child_process';
import { normalize, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from './logger.ts';
import { CONFIG } from './types.ts';

/**
 * The allowed base directory for file operations.
 * Only paths within ~/.claude/ are permitted.
 */
const ALLOWED_BASE_DIR = resolve(homedir(), '.claude');

/**
 * Check if a file path is within the allowed directory (~/.claude/).
 *
 * Security: This prevents access to arbitrary filesystem locations.
 * - Resolves the path to absolute normalized form
 * - Checks if it starts with the allowed base directory
 * - Handles traversal attempts like ~/.claude/../.ssh/
 *
 * @param filePath - The path to validate
 * @returns true if path is within ~/.claude/, false otherwise
 */
export function isAllowedPath(filePath: string): boolean {
  // Empty or non-string paths are not allowed
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Non-absolute paths are not allowed
  if (!filePath.startsWith('/')) {
    return false;
  }

  // Resolve to absolute normalized path (handles .., ., etc.)
  const normalizedPath = resolve(normalize(filePath));

  // Check if the normalized path starts with the allowed base directory
  // We add a trailing slash to prevent matching ~/.claudeXXX directories
  return (
    normalizedPath === ALLOWED_BASE_DIR ||
    normalizedPath.startsWith(ALLOWED_BASE_DIR + '/')
  );
}

/**
 * Supported file actions.
 */
export type FileAction = 'open' | 'reveal';

/**
 * Request body for file action endpoint.
 */
interface FileActionRequest {
  action: FileAction;
  path: string;
}

/**
 * Response for file action endpoint.
 */
interface FileActionResponse {
  success: boolean;
  error?: string;
}

/**
 * Validates a file action request.
 * Returns an error message if invalid, or null if valid.
 */
function validateRequest(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return 'Invalid request body';
  }

  const req = body as Record<string, unknown>;

  // Validate action
  if (req.action !== 'open' && req.action !== 'reveal') {
    return 'Invalid action. Must be "open" or "reveal"';
  }

  // Validate path is a string
  if (typeof req.path !== 'string' || req.path.length === 0) {
    return 'Invalid path. Must be a non-empty string';
  }

  // Validate path is an absolute path (starts with /)
  if (!req.path.startsWith('/')) {
    return 'Invalid path. Must be an absolute path starting with /';
  }

  // Validate path is within allowed directory (~/.claude/)
  if (!isAllowedPath(req.path)) {
    return 'Access denied. Path must be within ~/.claude/ directory';
  }

  return null;
}

/**
 * Get the platform-specific command for opening files.
 * Returns the command and flags needed to reveal a file in the file manager.
 */
function getOpenCommand(): { cmd: string; revealFlag: string[] } {
  switch (process.platform) {
    case 'darwin':
      return { cmd: 'open', revealFlag: ['-R'] };
    case 'win32':
      return { cmd: 'explorer', revealFlag: ['/select,'] };
    default:
      // Linux and other Unix-like systems
      return { cmd: 'xdg-open', revealFlag: [] };
  }
}

/**
 * Execute a file action (open or reveal in file manager).
 * Uses spawn with argument array to avoid shell injection vulnerabilities.
 * Cross-platform: macOS (open), Windows (explorer), Linux (xdg-open).
 */
async function executeFileAction(
  action: FileAction,
  filePath: string
): Promise<void> {
  const { cmd, revealFlag } = getOpenCommand();

  // Build arguments array - no shell escaping needed with spawn
  const args =
    action === 'reveal' && revealFlag.length > 0
      ? [...revealFlag, filePath]
      : [filePath];

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'ignore' });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Handle a file action HTTP request.
 *
 * Expected request:
 * POST /file-action
 * Content-Type: application/json
 * { "action": "open" | "reveal", "path": "/path/to/file.md" }
 *
 * Returns:
 * { "success": true } or { "success": false, "error": "..." }
 */
export async function handleFileActionRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Only handle /file-action endpoint
  if (req.url !== '/file-action') {
    return false;
  }

  // Set CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', `http://localhost:${CONFIG.STATIC_PORT}`);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Only handle POST
  if (req.method !== 'POST') {
    sendResponse(res, 405, { success: false, error: 'Method not allowed' });
    return true;
  }

  // Security: CSRF protection via Origin header validation
  // Localhost-only binding already limits attack surface, but Origin
  // validation prevents cross-origin requests from malicious sites
  const origin = req.headers.origin;
  const allowedOrigins = [
    `http://localhost:${CONFIG.STATIC_PORT}`,
    `http://127.0.0.1:${CONFIG.STATIC_PORT}`,
  ];

  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[FileActions] Rejected request from invalid origin: ${origin}`);
    sendResponse(res, 403, { success: false, error: 'Forbidden: Invalid origin' });
    return true;
  }

  // Parse request body
  let body: unknown;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const bodyStr = Buffer.concat(chunks).toString('utf-8');
    body = JSON.parse(bodyStr);
  } catch {
    sendResponse(res, 400, { success: false, error: 'Invalid JSON body' });
    return true;
  }

  // Validate request
  const validationError = validateRequest(body);
  if (validationError) {
    sendResponse(res, 400, { success: false, error: validationError });
    return true;
  }

  const { action, path } = body as FileActionRequest;

  // Execute the action
  try {
    await executeFileAction(action, path);
    logger.debug(`[FileActions] Executed ${action} for: ${path}`);
    sendResponse(res, 200, { success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[FileActions] Failed to execute ${action}:`, errorMessage);
    sendResponse(res, 500, { success: false, error: `Failed to ${action} file` });
  }

  return true;
}

/**
 * Send a JSON response.
 */
function sendResponse(res: ServerResponse, statusCode: number, data: FileActionResponse): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}
