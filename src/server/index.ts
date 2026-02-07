/**
 * Thinking Monitor Server - Entry Point
 *
 * Starts the monitor server with:
 * - WebSocket hub for real-time event broadcasting (port 3355)
 * - HTTP event receiver for Claude Code hooks (port 3355)
 * - Static file server for the dashboard (port 3356)
 *
 * Security: All servers bind to 127.0.0.1 only.
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketHub } from './websocket-hub.ts';
import { EventReceiver } from './event-receiver.ts';
import { StaticServer } from './static-server.ts';
import { TranscriptWatcher } from './transcript-watcher.ts';
import { PlanWatcher } from './plan-watcher.ts';
import { TeamWatcher } from './team-watcher.ts';
import { handleFileActionRequest } from './file-actions.ts';
import { handleExportRequest, handleBrowseRequest, handleRevealFileRequest } from './export-handler.ts';
import { CONFIG } from './types.ts';
import { logger } from './logger.ts';

// Get the dashboard directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dashboardDir = join(__dirname, '..', 'dashboard');

// For development with --experimental-strip-types, use src path
const srcDashboardDir = join(__dirname, '..', '..', 'src', 'dashboard');

/**
 * Start the thinking monitor server.
 */
async function main(): Promise<void> {
  logger.info(`
╔═══════════════════════════════════════════════════════════╗
║           THINKING MONITOR v${CONFIG.VERSION}                        ║
╠═══════════════════════════════════════════════════════════╣
║  Real-time monitoring for Claude Code thinking & tools    ║
╚═══════════════════════════════════════════════════════════╝
`);

  // Create WebSocket hub
  const hub = new WebSocketHub();

  // Create event receiver
  const eventReceiver = new EventReceiver(hub);

  // Create HTTP server for WebSocket and event receiver
  const httpServer = createServer(async (req, res) => {
    // Try to handle as file action request
    const fileActionHandled = await handleFileActionRequest(req, res);
    if (fileActionHandled) {
      return;
    }

    // Try to handle as browse request
    const browseHandled = await handleBrowseRequest(req, res);
    if (browseHandled) {
      return;
    }

    // Try to handle as export request
    const exportHandled = await handleExportRequest(req, res);
    if (exportHandled) {
      return;
    }

    // Try to handle as reveal-file request
    const revealFileHandled = await handleRevealFileRequest(req, res);
    if (revealFileHandled) {
      return;
    }

    // Try to handle as event receiver request
    const handled = await eventReceiver.handleRequest(req, res);

    if (!handled) {
      // Not an event receiver endpoint, return 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  // Attach WebSocket server to HTTP server
  hub.attach(httpServer);

  // Start the HTTP/WebSocket server
  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(CONFIG.WS_PORT, CONFIG.HOST, () => {
      logger.info(
        `[Server] WebSocket + Events at ws://${CONFIG.HOST}:${CONFIG.WS_PORT}`
      );
      logger.info(
        `[Server] Event endpoint: POST http://${CONFIG.HOST}:${CONFIG.WS_PORT}/event`
      );
      logger.info(
        `[Server] Health check: GET http://${CONFIG.HOST}:${CONFIG.WS_PORT}/health`
      );
      resolve();
    });
  });

  // Determine which dashboard directory to use
  let dashboardPath: string;
  try {
    const { stat } = await import('node:fs/promises');
    await stat(join(srcDashboardDir, 'index.html'));
    dashboardPath = srcDashboardDir;
  } catch {
    dashboardPath = dashboardDir;
  }

  // Start static file server
  const staticServer = new StaticServer(dashboardPath);
  await staticServer.start();

  // Start transcript watcher for thinking blocks
  const transcriptWatcher = new TranscriptWatcher(hub);
  await transcriptWatcher.start();
  logger.info(`[Server] Transcript watcher started`);

  // Start plan watcher for ~/.claude/plans/ directory
  const planWatcher = new PlanWatcher(hub);
  await planWatcher.start();
  logger.info(`[Server] Plan watcher started`);

  // Start team/task watcher for ~/.claude/teams/ and ~/.claude/tasks/
  const teamWatcher = new TeamWatcher(hub);
  await teamWatcher.start();
  logger.info(`[Server] Team/task watcher started`);

  // Send current state to newly connected clients
  hub.onClientConnect(async (sendEvent) => {
    // Send session_start events for all known sessions (with working directories)
    const knownSessions = transcriptWatcher.getKnownSessions();
    for (const { sessionId, workingDirectory } of knownSessions) {
      sendEvent({
        type: 'session_start',
        timestamp: new Date().toISOString(),
        sessionId,
        workingDirectory,
      });
    }

    // Send current subagent mappings
    const subagentMappingEvent = eventReceiver.createSubagentMappingEvent();
    if (subagentMappingEvent.mappings.length > 0) {
      sendEvent(subagentMappingEvent);
    }

    // Send the list of all available plans
    const planListEvent = planWatcher.getPlanListEvent();
    if (planListEvent.plans.length > 0) {
      sendEvent(planListEvent);
    }

    // Send the most recent plan content
    const planEvent = await planWatcher.getMostRecentPlanEvent();
    if (planEvent) {
      sendEvent(planEvent);
    }

    // Send current team state
    for (const teamEvent of teamWatcher.getTeamEvents()) {
      sendEvent(teamEvent);
    }

    // Send current task state
    for (const taskEvent of teamWatcher.getTaskEvents()) {
      sendEvent(taskEvent);
    }
  });

  // Handle client requests (e.g., plan_request)
  hub.onClientRequest(async (request, sendResponse) => {
    if (request.type === 'plan_request') {
      logger.debug(`[Server] Plan content requested: ${request.path}`);
      const planEvent = await planWatcher.getPlanContent(request.path);
      if (planEvent) {
        sendResponse(planEvent);
      } else {
        logger.warn(`[Server] Plan not found: ${request.path}`);
      }
    }
  });

  logger.info(`
╔═══════════════════════════════════════════════════════════╗
║  DASHBOARD: http://localhost:${CONFIG.STATIC_PORT}                        ║
╚═══════════════════════════════════════════════════════════╝
`);

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info('\n[Server] Shutting down...');

    teamWatcher.stop();
    planWatcher.stop();
    transcriptWatcher.stop();
    eventReceiver.destroy();
    hub.close();
    await staticServer.stop();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    logger.info('[Server] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the process running
  logger.info('[Server] Ready. Press Ctrl+C to stop.\n');
}

// Run the server
main().catch((error) => {
  logger.error('[Server] Fatal error:', error);
  process.exit(1);
});
