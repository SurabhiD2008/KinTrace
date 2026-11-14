import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '../../src/zod';

// The site's Content-Security-Policy forbids eval. Zod's default eval probe breaks that policy
// (Firefox reports it as an error on every page), so the browser code must use zod in jitless
// mode, through src/zod.ts.

function browserSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return browserSources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('zod under the Content-Security-Policy', () => {
  it('is configured to run without eval', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('is imported only through src/zod.ts in browser code', () => {
    const direct = browserSources('src').filter((file) => file !== join('src', 'zod.ts') && /from 'zod'/.test(readFileSync(file, 'utf8')));
    expect(direct).toEqual([]);
  });
});
