#!/usr/bin/env node
/**
 * Cross-platform watch runner for dashboard + server.
 * Replaces shell backgrounding so Ctrl+C shuts down both processes cleanly.
 */

import { spawn } from 'node:child_process';

function start(command) {
  return spawn(command, {
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
}

const children = [
  start('pnpm build:dashboard --watch'),
  start('node --watch --experimental-strip-types src/server/index.ts'),
];

let shuttingDown = false;

function terminateChildren() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  }, 3000);
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      terminateChildren();
      process.exit(1);
      return;
    }

    if (typeof code === 'number' && code !== 0) {
      terminateChildren();
      process.exit(code);
    }
  });
}

process.on('SIGINT', () => {
  terminateChildren();
  process.exit(0);
});

process.on('SIGTERM', () => {
  terminateChildren();
  process.exit(0);
});
