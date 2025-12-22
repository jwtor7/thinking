/**
 * Static File Server for the Thinking Monitor Dashboard.
 *
 * Serves static files from the dashboard directory on port 3356.
 * Bound to localhost only for security.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { CONFIG } from './types.ts';

/** MIME type mapping for static files */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/**
 * Static file server for the dashboard.
 */
export class StaticServer {
  private server: ReturnType<typeof createServer> | null = null;
  private dashboardDir: string;

  constructor(dashboardDir: string) {
    this.dashboardDir = resolve(dashboardDir);
  }

  /**
   * Start the static file server.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this));

      this.server.on('error', (error) => {
        console.error('[StaticServer] Server error:', error);
        reject(error);
      });

      // Bind to localhost only (security requirement)
      this.server.listen(CONFIG.STATIC_PORT, CONFIG.HOST, () => {
        console.log(
          `[StaticServer] Serving dashboard at http://${CONFIG.HOST}:${CONFIG.STATIC_PORT}`
        );
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP request.
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      // Only allow GET requests
      if (req.method !== 'GET') {
        this.sendError(res, 405, 'Method Not Allowed');
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      let pathname = url.pathname;

      // Default to index.html for root
      if (pathname === '/') {
        pathname = '/index.html';
      }

      // Resolve the file path and validate it's within the dashboard directory
      const filePath = this.resolveFilePath(pathname);

      if (!filePath) {
        this.sendError(res, 403, 'Forbidden');
        return;
      }

      await this.serveFile(res, filePath);
    } catch (error) {
      console.error('[StaticServer] Request error:', error);
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  /**
   * Resolve and validate the file path.
   * Returns null if the path is outside the dashboard directory (security).
   */
  private resolveFilePath(pathname: string): string | null {
    // Decode URL encoding
    const decoded = decodeURIComponent(pathname);

    // Join with dashboard directory
    const filePath = join(this.dashboardDir, decoded);

    // Resolve to absolute path
    const resolved = resolve(filePath);

    // Security: ensure the resolved path is within the dashboard directory
    if (!resolved.startsWith(this.dashboardDir)) {
      console.warn('[StaticServer] Path traversal attempt:', pathname);
      return null;
    }

    return resolved;
  }

  /**
   * Serve a static file.
   */
  private async serveFile(res: ServerResponse, filePath: string): Promise<void> {
    try {
      // Check if file exists and is a file (not directory)
      const stats = await stat(filePath);

      if (!stats.isFile()) {
        this.sendError(res, 404, 'Not Found');
        return;
      }

      // Read file content
      const content = await readFile(filePath);

      // Determine MIME type
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Set headers
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'Cache-Control': 'no-cache', // No caching during development
        'X-Content-Type-Options': 'nosniff',
      });

      res.end(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.sendError(res, 404, 'Not Found');
      } else {
        throw error;
      }
    }
  }

  /**
   * Send an error response.
   */
  private sendError(res: ServerResponse, code: number, message: string): void {
    res.writeHead(code, { 'Content-Type': 'text/plain' });
    res.end(`${code} ${message}`);
  }

  /**
   * Stop the server.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[StaticServer] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
