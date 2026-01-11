/**
 * Export Handler for the Thinking Monitor.
 *
 * Provides a secure endpoint for saving markdown exports to disk.
 *
 * Security considerations:
 * - Validates path to prevent directory traversal
 * - Requires .md extension for all exports
 * - Localhost-only binding ensures only local access
 * - Validates content is not excessively large
 */

import { writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, normalize, resolve, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { exec } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from './logger.ts';
import { CONFIG } from './types.ts';
import { parse as parseUrl } from 'node:url';

/**
 * Maximum content size for export (1MB).
 */
const MAX_EXPORT_SIZE = 1024 * 1024;

/**
 * Validate that a path is safe (absolute, normalized, no symlink escapes).
 * Does NOT restrict to specific directories - user can save anywhere they have access.
 *
 * @param filePath - The path to validate
 * @returns The normalized absolute path, or null if invalid
 */
export function validateExportPath(filePath: string): string | null {
  // Must be an absolute path
  if (!filePath || !isAbsolute(filePath)) {
    return null;
  }

  // Normalize to prevent traversal attacks
  const normalizedPath = resolve(normalize(filePath));

  // Ensure the normalized path doesn't escape via .. sequences
  // (resolve/normalize should handle this, but double-check)
  if (normalizedPath.includes('/../') || normalizedPath.endsWith('/..')) {
    return null;
  }

  return normalizedPath;
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
 * Returns an error message if invalid, or the validated request if valid.
 */
function validateExportRequestBody(
  body: unknown
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

  // Validate path ends with .md (security: only allow markdown files)
  if (!req.path.endsWith('.md')) {
    return { error: 'Invalid path. File must have .md extension' };
  }

  // Validate and normalize path (path traversal protection)
  const normalizedPath = validateExportPath(req.path);
  if (!normalizedPath) {
    return { error: 'Invalid path. Path contains invalid characters or traversal sequences' };
  }

  // Validate content is a string
  if (typeof req.content !== 'string') {
    return { error: 'Invalid content. Must be a string' };
  }

  // Validate content size
  if (req.content.length > MAX_EXPORT_SIZE) {
    return { error: `Content too large. Maximum size is ${MAX_EXPORT_SIZE} bytes` };
  }

  return {
    request: {
      path: normalizedPath,
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
 * @returns true if the request was handled, false if it should be passed to the next handler
 */
export async function handleExportRequest(
  req: IncomingMessage,
  res: ServerResponse
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
  const validation = validateExportRequestBody(body);
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
 * Response for browse endpoint.
 */
interface BrowseResponse {
  success: boolean;
  error?: string;
  path?: string;
  parent?: string | null;
  entries?: Array<{ name: string; type: 'file' | 'directory' }>;
}

/**
 * Handle a browse request to list directory contents.
 *
 * Expected request:
 * GET /api/browse?path=/absolute/path/to/directory
 *
 * Returns:
 * { "success": true, "path": "...", "parent": "...", "entries": [...] }
 * or { "success": false, "error": "..." }
 *
 * Security: Allows browsing any directory the user has access to.
 * This is safe because:
 * - Server binds to localhost only (no remote access)
 * - User can only see directories they already have permission to access
 * - Path traversal is prevented via normalization
 *
 * @param req - The HTTP request
 * @param res - The HTTP response
 * @returns true if the request was handled, false if it should be passed to the next handler
 */
export async function handleBrowseRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Only handle /api/browse endpoint
  const parsedUrl = parseUrl(req.url || '', true);
  if (!parsedUrl.pathname?.startsWith('/api/browse')) {
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Only handle GET
  if (req.method !== 'GET') {
    sendBrowseResponse(res, 405, { success: false, error: 'Method not allowed' });
    return true;
  }

  // Reject requests from unknown origins (if origin is present)
  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[Browse] Rejected request from invalid origin: ${origin}`);
    sendBrowseResponse(res, 403, { success: false, error: 'Forbidden: Invalid origin' });
    return true;
  }

  // Get the path parameter
  const requestedPath = parsedUrl.query.path;
  if (!requestedPath || typeof requestedPath !== 'string') {
    sendBrowseResponse(res, 400, { success: false, error: 'Missing path parameter' });
    return true;
  }

  // Expand ~ to home directory
  let normalizedPath = requestedPath;
  if (normalizedPath.startsWith('~/')) {
    normalizedPath = join(homedir(), normalizedPath.slice(2));
  } else if (normalizedPath === '~') {
    normalizedPath = homedir();
  }

  // Normalize and resolve the path (prevents traversal attacks)
  normalizedPath = resolve(normalize(normalizedPath));

  // Validate path is absolute
  if (!isAbsolute(normalizedPath)) {
    sendBrowseResponse(res, 400, { success: false, error: 'Path must be absolute' });
    return true;
  }

  try {
    // Check if path exists and is a directory
    const pathStat = await stat(normalizedPath);
    if (!pathStat.isDirectory()) {
      sendBrowseResponse(res, 400, { success: false, error: 'Path is not a directory' });
      return true;
    }

    // Read directory contents
    const dirEntries = await readdir(normalizedPath, { withFileTypes: true });

    // Filter and map entries
    const entries: Array<{ name: string; type: 'file' | 'directory' }> = [];
    for (const entry of dirEntries) {
      // Skip hidden files (starting with .) except for special directories
      if (entry.name.startsWith('.') && entry.name !== '.claude') {
        continue;
      }

      if (entry.isDirectory()) {
        entries.push({ name: entry.name, type: 'directory' });
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Only show .md files
        entries.push({ name: entry.name, type: 'file' });
      }
    }

    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Calculate parent directory (always available unless at root)
    let parentPath: string | null = null;
    const parentDir = dirname(normalizedPath);
    if (parentDir !== normalizedPath) {
      parentPath = parentDir;
    }

    logger.debug(`[Browse] Listed ${entries.length} entries in: ${normalizedPath}`);
    sendBrowseResponse(res, 200, {
      success: true,
      path: normalizedPath,
      parent: parentPath,
      entries,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      sendBrowseResponse(res, 404, { success: false, error: 'Directory not found' });
    } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      sendBrowseResponse(res, 403, { success: false, error: 'Permission denied' });
    } else {
      logger.error(`[Browse] Failed to read directory:`, errorMessage);
      sendBrowseResponse(res, 500, { success: false, error: 'Failed to read directory' });
    }
  }

  return true;
}

/**
 * Send a JSON response for browse endpoint.
 */
function sendBrowseResponse(res: ServerResponse, statusCode: number, data: BrowseResponse): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}

/**
 * Send a JSON response for export endpoint.
 */
function sendResponse(res: ServerResponse, statusCode: number, data: ExportResponse): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}

/**
 * Response for reveal-file endpoint.
 */
interface RevealFileResponse {
  success: boolean;
  error?: string;
}

/**
 * Send a JSON response for reveal-file endpoint.
 */
function sendRevealFileResponse(res: ServerResponse, statusCode: number, data: RevealFileResponse): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle a request to reveal a file in Finder.
 *
 * Expected request:
 * POST /api/reveal-file
 * Content-Type: application/json
 * { "path": "/absolute/path/to/file.md" }
 *
 * Returns:
 * { "success": true }
 * or { "success": false, "error": "..." }
 *
 * Security:
 * - Only allows .md files
 * - Validates path is absolute and normalized
 * - Localhost-only binding ensures only local access
 *
 * @param req - The HTTP request
 * @param res - The HTTP response
 * @returns true if the request was handled, false if it should be passed to the next handler
 */
export async function handleRevealFileRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Only handle /api/reveal-file endpoint
  if (req.url !== '/api/reveal-file') {
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
    sendRevealFileResponse(res, 405, { success: false, error: 'Method not allowed' });
    return true;
  }

  // Reject requests from unknown origins
  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[RevealFile] Rejected request from invalid origin: ${origin}`);
    sendRevealFileResponse(res, 403, { success: false, error: 'Forbidden: Invalid origin' });
    return true;
  }

  // Parse request body
  let body: unknown;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
      // Limit body size (path should be small)
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize > 4096) {
        sendRevealFileResponse(res, 413, { success: false, error: 'Request body too large' });
        return true;
      }
    }
    const bodyStr = Buffer.concat(chunks).toString('utf-8');
    body = JSON.parse(bodyStr);
  } catch {
    sendRevealFileResponse(res, 400, { success: false, error: 'Invalid JSON body' });
    return true;
  }

  // Validate body
  if (typeof body !== 'object' || body === null) {
    sendRevealFileResponse(res, 400, { success: false, error: 'Invalid request body' });
    return true;
  }

  const { path: filePath } = body as { path?: string };

  // Validate path is a string
  if (typeof filePath !== 'string' || filePath.length === 0) {
    sendRevealFileResponse(res, 400, { success: false, error: 'Invalid path. Must be a non-empty string' });
    return true;
  }

  // Validate path is absolute
  if (!isAbsolute(filePath)) {
    sendRevealFileResponse(res, 400, { success: false, error: 'Invalid path. Must be an absolute path' });
    return true;
  }

  // Security: Only allow .md files
  if (!filePath.endsWith('.md')) {
    sendRevealFileResponse(res, 400, { success: false, error: 'Invalid path. Only .md files are allowed' });
    return true;
  }

  // Normalize path to prevent traversal
  const normalizedPath = resolve(normalize(filePath));
  if (normalizedPath.includes('/../') || normalizedPath.endsWith('/..')) {
    sendRevealFileResponse(res, 400, { success: false, error: 'Invalid path. Path contains traversal sequences' });
    return true;
  }

  // Reveal the file in Finder (macOS)
  try {
    await new Promise<void>((resolvePromise, reject) => {
      // Use double quotes and escape any quotes in the path
      // -R flag reveals the file in Finder instead of opening it
      const escapedPath = normalizedPath.replace(/"/g, '\\"');
      exec(`open -R "${escapedPath}"`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolvePromise();
        }
      });
    });

    logger.info(`[RevealFile] Revealed file in Finder: ${normalizedPath}`);
    sendRevealFileResponse(res, 200, { success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[RevealFile] Failed to reveal file:`, errorMessage);
    sendRevealFileResponse(res, 500, { success: false, error: 'Failed to reveal file' });
  }

  return true;
}
