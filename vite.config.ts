import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { parseCounts } from './src/pages/method/counts.ts';

// The method page shows the counts from the last `npm run verify` (test-counts.json).
const testCounts = parseCounts(JSON.parse(readFileSync('src/pages/method/test-counts.json', 'utf8')));

// The security headers live in vercel.json (what production serves); the preview
// server sends the same ones, so end-to-end tests run under the real policy.
interface VercelConfig {
  headers?: { source: string; headers: { key: string; value: string }[] }[];
}
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
const securityHeaders = Object.fromEntries(
  (vercel.headers ?? []).flatMap((rule) => rule.headers.map((header) => [header.key, header.value])),
);

export default defineConfig({
  plugins: [react()],
  define: { __TEST_COUNTS__: JSON.stringify(testCounts) },
  preview: { headers: securityHeaders },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // The pure layers carry the product's claims, so they carry the thresholds.
      include: ['src/domain/**', 'src/guidelines/**', 'src/parser/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        'src/domain/**': { lines: 90, branches: 85 },
        'src/guidelines/**': { lines: 90, branches: 85 },
        'src/parser/**': { lines: 90, branches: 85 },
      },
    },
  },
});
