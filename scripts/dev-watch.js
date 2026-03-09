#!/usr/bin/env node
/**
 * Development watch runner for dashboard + server.
 *
 * Why this exists:
 * - `node --watch` can hit EMFILE on some environments (notably Node 25 on macOS).
 * - We only watch two directories for server restarts to keep watcher count low.
 */

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WATCH_DIRS = [join(ROOT, 'src', 'server'), join(ROOT, 'src', 'shared')];

function start(command) {
  return spawn(command, {
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
}

let dashboardWatcher = start('pnpm build:dashboard --watch');
let serverProcess = start('node --experimental-transform-types src/server/index.ts');

let shuttingDown = false;
let restartTimer = null;
const fsWatchers = [];

function terminateChild(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
}

function scheduleServerRestart() {
  if (shuttingDown) return;
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(() => {
    if (shuttingDown) return;
    terminateChild(serverProcess);
    serverProcess = start('node --experimental-transform-types src/server/index.ts');
    attachServerExitHandler(serverProcess);
  }, 150);
}

function attachServerExitHandler(child) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (signal) return;
    if (typeof code === 'number' && code !== 0) {
      // Keep the watch session alive; rapid edits may cause temporary parse errors.
      // A subsequent file change will restart the process.
      console.error(`[dev:watch] Server exited with code ${code}. Waiting for next change...`);
    }
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  for (const watcher of fsWatchers) {
    try {
      watcher.close();
    } catch {
      // Ignore close errors during shutdown.
    }
  }

  terminateChild(dashboardWatcher);
  terminateChild(serverProcess);

  setTimeout(() => {
    terminateChild(dashboardWatcher);
    terminateChild(serverProcess);
    process.exit(0);
  }, 1500);
}

for (const dir of WATCH_DIRS) {
  const watcher = watch(dir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    if (
      filename.endsWith('.ts')
      || filename.endsWith('.json')
      || filename.endsWith('.md')
    ) {
      scheduleServerRestart();
    }
  });
  watcher.on('error', (error) => {
    if (!shuttingDown) {
      console.error(`[dev:watch] Watch error in ${dir}:`, error.message);
    }
  });
  fsWatchers.push(watcher);
}

attachServerExitHandler(serverProcess);

dashboardWatcher.on('exit', (code, signal) => {
  if (shuttingDown) return;
  if (signal) {
    shutdown();
    return;
  }
  if (typeof code === 'number' && code !== 0) {
    console.error(`[dev:watch] Dashboard watcher exited with code ${code}`);
    shutdown();
  }
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

