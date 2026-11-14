import { defineConfig } from 'vitest/config';

// Only for `npm run eval:parser`. The normal test run never includes tests/eval.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/eval/**/*.eval.ts'],
  },
});
