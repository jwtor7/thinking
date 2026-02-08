#!/usr/bin/env node
/**
 * Start the production server in the background with PID tracking.
 * Uses a pidfile instead of broad process matching.
 */

import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const pidFile = '/tmp/thinking-monitor.pid';
const logFile = '/tmp/thinking-monitor.log';

function isRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function sleep(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function findProcessOnPort(port) {
  try {
    const { execSync } = require('node:child_process');
    const output = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
    if (output) {
      return output.split('\n').map((p) => Number.parseInt(p, 10)).filter(Number.isInteger);
    }
  } catch {
    // No process on port
  }
  return [];
}

async function stopExistingProcess() {
  let existingPid = null;

  // Check PID file first
  if (existsSync(pidFile)) {
    existingPid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    if (!isRunning(existingPid)) {
      unlinkSync(pidFile);
      existingPid = null;
    }
  }

  // Fallback: check if something is already holding the port
  if (!existingPid) {
    const portPids = findProcessOnPort(3355);
    if (portPids.length === 0) return;
    existingPid = portPids[0];
    console.log(`Found orphaned process on port 3355 (pid: ${existingPid})`);
  }

  console.log(`Stopping existing server process (${existingPid})...`);
  process.kill(existingPid, 'SIGTERM');

  const stopDeadline = Date.now() + 5000;
  while (Date.now() < stopDeadline) {
    if (!isRunning(existingPid)) {
      unlinkSync(pidFile);
      return;
    }
    await sleep(100);
  }

  console.warn(`Process ${existingPid} did not exit after SIGTERM, sending SIGKILL`);
  process.kill(existingPid, 'SIGKILL');
  await sleep(100);

  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}

async function main() {
  await stopExistingProcess();

  const logFd = openSync(logFile, 'a');
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: rootDir,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  child.unref();
  closeSync(logFd);

  writeFileSync(pidFile, `${child.pid}\n`, 'utf8');

  console.log(`Server started (pid: ${child.pid}). Logs: ${logFile}`);
}

main().catch((error) => {
  console.error('Failed to ship server:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
