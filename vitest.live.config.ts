import { defineConfig } from 'vitest/config';

// Only for `npm run check:providers`, which makes real, paid calls. Never part of verify.
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/live/**/*.live.ts'] },
});
