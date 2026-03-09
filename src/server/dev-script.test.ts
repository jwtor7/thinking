import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Development Script Defaults', () => {
  it('uses stable non-watch mode for `pnpm dev`', () => {
    const packagePath = resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    const devScript = packageJson.scripts?.dev || '';
    expect(devScript).toContain('node --experimental-transform-types src/server/index.ts');
    expect(devScript).not.toContain('--watch');
  });
});

