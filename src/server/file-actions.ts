/**
 * File Actions Handler for the Thinking Monitor.
 *
 * Provides secure file operations for the dashboard:
 * - Open files in default application
 * - Reveal files in Finder
 *
 * Security:
 * - Localhost-only binding ensures only local access
 * - Validates path is absolute and doesn't contain traversal patterns
 * - Uses macOS `open` command which respects filesystem permissions
 * - No sensitive operations (read/write/delete) - only open/reveal
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { normalize } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const execAsync = promisify(exec);

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

  // Prevent directory traversal attacks
  if (req.path.includes('..')) {
    return 'Access denied. Path must not contain ".."';
  }

  // Normalize the path to resolve any relative components
  normalize(req.path);

  // Since this is a localhost-only tool that only opens/reveals files
  // (no read/write/delete), we allow any absolute path. The macOS `open`
  // command will respect filesystem permissions.

  return null;
}

/**
 * Execute a file action (open or reveal in Finder).
 * Uses macOS `open` command.
 */
async function executeAction(action: FileAction, filePath: string): Promise<void> {
  // Escape the file path for shell execution
  // Replace single quotes with escaped version
  const escapedPath = filePath.replace(/'/g, "'\\''");

  let command: string;
  if (action === 'open') {
    // Open in default application
    command = `open '${escapedPath}'`;
  } else {
    // Reveal in Finder (select the file)
    command = `open -R '${escapedPath}'`;
  }

  await execAsync(command);
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
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3356');
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
    await executeAction(action, path);
    console.log(`[FileActions] Executed ${action} for: ${path}`);
    sendResponse(res, 200, { success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FileActions] Failed to execute ${action}:`, errorMessage);
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
