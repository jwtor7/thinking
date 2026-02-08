#!/usr/bin/env node
/**
 * Bump version and update release metadata.
 * Usage: ./scripts/bump-version.sh [patch|minor|major]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUMP_TYPES = new Set(['patch', 'minor', 'major']);
const bumpType = process.argv[2] ?? 'patch';

if (!BUMP_TYPES.has(bumpType)) {
  console.error(`Usage: ${process.argv[1]} [patch|minor|major]`);
  console.error('  patch - bug fixes (1.2.0 -> 1.2.1)');
  console.error('  minor - new features (1.2.0 -> 1.3.0)');
  console.error('  major - breaking changes (1.2.0 -> 2.0.0)');
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const packagePath = resolve(rootDir, 'package.json');
const changelogPath = resolve(rootDir, 'CHANGELOG.md');
const readmePath = resolve(rootDir, 'README.md');

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const currentVersion = pkg.version;
const next = parseSemver(currentVersion);

if (bumpType === 'patch') {
  next.patch += 1;
}
if (bumpType === 'minor') {
  next.minor += 1;
  next.patch = 0;
}
if (bumpType === 'major') {
  next.major += 1;
  next.minor = 0;
  next.patch = 0;
}

const newVersion = `${next.major}.${next.minor}.${next.patch}`;
console.log(`Current version: ${currentVersion}`);
console.log(`New version: ${newVersion}`);

pkg.version = newVersion;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('Updated package.json');

let readme = readFileSync(readmePath, 'utf8');
const badgePattern = /(\[!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-)([^)-]+)(-purple\)\]\(\.\/CHANGELOG\.md\))/;
if (!badgePattern.test(readme)) {
  throw new Error('Could not find version badge in README.md');
}
readme = readme.replace(badgePattern, `$1${newVersion}$3`);
writeFileSync(readmePath, readme, 'utf8');
console.log('Updated README.md version badge');

const today = formatToday();
const changelogHeading = `## ${today} — v${newVersion}`;
let changelog = readFileSync(changelogPath, 'utf8');

if (!changelog.includes(changelogHeading)) {
  const prefix = '# Changelog\n\n';
  const entry = `${changelogHeading}\n\n### Changed\n- Version bump to v${newVersion}\n\n---\n\n`;

  if (changelog.startsWith(prefix)) {
    changelog = `${prefix}${entry}${changelog.slice(prefix.length).replace(/^\n+/, '')}`;
  } else if (changelog.startsWith('# Changelog')) {
    changelog = changelog.replace(/^# Changelog\s*\n*/m, '# Changelog\n\n') + '\n';
    changelog = `${prefix}${entry}${changelog.replace(/^# Changelog\s*\n*/m, '')}`;
  } else {
    changelog = `${prefix}${entry}${changelog}`;
  }
  writeFileSync(changelogPath, changelog, 'utf8');
  console.log('Added CHANGELOG.md entry');
} else {
  console.log(`CHANGELOG.md already has entry: ${changelogHeading}`);
}

console.log('');
console.log(`Version bumped to v${newVersion}`);
console.log('');
console.log('Next steps:');
console.log('  1. Update CHANGELOG.md notes for this release');
console.log('  2. Update README.md Recent Changes if needed');
console.log(`  3. git add -A && git commit -m "v${newVersion}: <description>"`);
console.log(`  4. git tag -a v${newVersion} -m "v${newVersion}: <description>"`);
console.log('  5. git push origin main --tags');
