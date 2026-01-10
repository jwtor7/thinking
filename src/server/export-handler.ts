/**
 * Export Handler for the Thinking Monitor.
 *
 * Provides a secure endpoint for saving markdown exports to disk.
 *
 * Security considerations:
 * - Validates path to prevent directory traversal
 * - Only allows writing to certain safe directories
 * - Localhost-only binding ensures only local access
 * - Validates content is not excessively large
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, normalize, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from './logger.ts';
import { CONFIG } from './types.ts';

/**
 * Maximum content size for export (1MB).
 */
const MAX_EXPORT_SIZE = 1024 * 1024;

/**
 * Paths that are always allowed for export.
 * These are safe directories the user can write to.
 */
const ALWAYS_ALLOWED_PATHS = [
  resolve(homedir(), '.claude'),
  resolve(homedir(), 'Desktop'),
  resolve(homedir(), 'Documents'),
  resolve(homedir(), 'Downloads'),
];

/**
 * Check if a path is safe for export.
 * Allows:
 * - Paths within ~/.claude/
 * - Paths within ~/Desktop/, ~/Documents/, ~/Downloads/
 * - Paths within any session working directory (user's project directories)
 *
 * @param filePath - The path to validate
 * @param allowedWorkingDirs - Set of allowed working directories from active sessions
 * @returns true if path is safe for export
 */
export function isExportPathAllowed(
  filePath: string,
  allowedWorkingDirs: Set<string> = new Set()
): boolean {
  // Must be an absolute path
  if (!filePath || !isAbsolute(filePath)) {
    return false;
  }

  // Normalize to prevent traversal attacks
  const normalizedPath = resolve(normalize(filePath));

  // Check against always-allowed paths
  for (const allowedBase of ALWAYS_ALLOWED_PATHS) {
    if (normalizedPath === allowedBase || normalizedPath.startsWith(allowedBase + '/')) {
      return true;
    }
  }

  // Check against session working directories
  for (const workingDir of allowedWorkingDirs) {
    const normalizedWorkingDir = resolve(normalize(workingDir));
    if (
      normalizedPath === normalizedWorkingDir ||
      normalizedPath.startsWith(normalizedWorkingDir + '/')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Request body for export endpoint.
 */
interface ExportRequest {
  path: string;
  content: string;
}

/**
 * Response for export endpoint.
 */
interface ExportResponse {
  success: boolean;
  error?: string;
  path?: string;
}

/**
 * Validates an export request.
 * Returns an error message if invalid, or null if valid.
 */
function validateExportRequest(
  body: unknown,
  allowedWorkingDirs: Set<string>
): { error: string } | { request: ExportRequest } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Invalid request body' };
  }

  const req = body as Record<string, unknown>;

  // Validate path is a string
  if (typeof req.path !== 'string' || req.path.length === 0) {
    return { error: 'Invalid path. Must be a non-empty string' };
  }

  // Validate path is absolute
  if (!isAbsolute(req.path)) {
    return { error: 'Invalid path. Must be an absolute path' };
  }

  // Validate path ends with .md
  if (!req.path.endsWith('.md')) {
    return { error: 'Invalid path. File must have .md extension' };
  }

  // Validate content is a string
  if (typeof req.content !== 'string') {
    return { error: 'Invalid content. Must be a string' };
  }

  // Validate content size
  if (req.content.length > MAX_EXPORT_SIZE) {
    return { error: `Content too large. Maximum size is ${MAX_EXPORT_SIZE} bytes` };
  }

  // Validate path is in an allowed location
  if (!isExportPathAllowed(req.path, allowedWorkingDirs)) {
    return {
      error:
        'Path not allowed. Export must be to ~/.claude/, ~/Desktop/, ~/Documents/, ~/Downloads/, or a project directory.',
    };
  }

  return {
    request: {
      path: req.path,
      content: req.content,
    },
  };
}

/**
 * Handle an export request.
 *
 * Expected request:
 * POST /export-markdown
 * Content-Type: application/json
 * { "path": "/absolute/path/to/file.md", "content": "markdown content" }
 *
 * Returns:
 * { "success": true, "path": "/path/to/file.md" }
 * or { "success": false, "error": "..." }
 *
 * @param req - The HTTP request
 * @param res - The HTTP response
 * @param allowedWorkingDirs - Set of allowed working directories from active sessions
 * @returns true if the request was handled, false if it should be passed to the next handler
 */
export async function handleExportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowedWorkingDirs: Set<string> = new Set()
): Promise<boolean> {
  // Only handle /export-markdown endpoint
  if (req.url !== '/export-markdown') {
    return false;
  }

  // Security: CSRF protection via Origin header validation
  const origin = req.headers.origin;
  const allowedOrigins = [
    `http://localhost:${CONFIG.STATIC_PORT}`,
    `http://127.0.0.1:${CONFIG.STATIC_PORT}`,
  ];

  // Set CORS headers
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', `http://localhost:${CONFIG.STATIC_PORT}`);
  }
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

  // Reject requests from unknown origins
  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[Export] Rejected request from invalid origin: ${origin}`);
    sendResponse(res, 403, { success: false, error: 'Forbidden: Invalid origin' });
    return true;
  }

  // Parse request body
  let body: unknown;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
      // Check size limit during read to prevent memory exhaustion
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize > MAX_EXPORT_SIZE + 1024) {
        // Allow some overhead for JSON structure
        sendResponse(res, 413, { success: false, error: 'Request body too large' });
        return true;
      }
    }
    const bodyStr = Buffer.concat(chunks).toString('utf-8');
    body = JSON.parse(bodyStr);
  } catch {
    sendResponse(res, 400, { success: false, error: 'Invalid JSON body' });
    return true;
  }

  // Validate request
  const validation = validateExportRequest(body, allowedWorkingDirs);
  if ('error' in validation) {
    sendResponse(res, 400, { success: false, error: validation.error });
    return true;
  }

  const { path: exportPath, content } = validation.request;

  // Ensure the directory exists
  try {
    const dir = dirname(exportPath);
    await mkdir(dir, { recursive: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Export] Failed to create directory:`, errorMessage);
    sendResponse(res, 500, { success: false, error: 'Failed to create directory' });
    return true;
  }

  // Write the file
  try {
    await writeFile(exportPath, content, 'utf-8');
    logger.info(`[Export] Successfully exported to: ${exportPath}`);
    sendResponse(res, 200, { success: true, path: exportPath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Export] Failed to write file:`, errorMessage);
    sendResponse(res, 500, { success: false, error: 'Failed to write file' });
  }

  return true;
}

/**
 * Send a JSON response.
 */
function sendResponse(res: ServerResponse, statusCode: number, data: ExportResponse): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}
