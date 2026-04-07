import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('host memory regression', () => {
  it.each([
    'large.jpg',
    'color-baseline.jpg',
  ])('does not leak obvious host memory across repeated JPEG stream transforms for %s', (fixture) => {
    const output = execFileSync(
      process.execPath,
      ['--expose-gc', join(process.cwd(), 'tests', 'node', 'memory-harness.mjs'), fixture],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );

    const result = JSON.parse(output);
    expect(result.peakDelta.arrayBuffers).toBeLessThan(32 * 1024 * 1024);
    expect(result.peakDelta.rss).toBeLessThan(160 * 1024 * 1024);
  });
});
