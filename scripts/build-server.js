#!/usr/bin/env node
/**
 * Build script for the server that injects package version at build time.
 */

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf-8')
);
const version = packageJson.version;

console.log(`Building server with version ${version}...`);

await build({
  entryPoints: [join(projectRoot, 'src/server/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: join(projectRoot, 'dist/server'),
  packages: 'external',
  define: {
    __PACKAGE_VERSION__: JSON.stringify(version),
  },
});

console.log(`Server build complete.`);
