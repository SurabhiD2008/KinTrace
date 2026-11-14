import { defineConfig } from 'vitest/config';

// Only for `npm run test:mutation`: the unit tests that exercise the guideline rules and the
// relationship engine. Standalone (not merged with vite.config.ts, whose arrays would be
// appended). Property tests are left out because 500 families per mutant is too slow.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/guidelines/**/*.test.ts', 'tests/unit/domain/relationships.test.ts'],
  },
});
