// Test counts for the method page. `npm run verify` writes test-counts.json from the
// test runs it has just made; vite.config.ts reads it at build time and passes only
// the two numbers to the app.

export interface TestCounts {
  unit: number;
  e2e: number;
}

const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/** The counts in the recorded file, or null when the file is missing or malformed. */
export function parseCounts(value: unknown): TestCounts | null {
  if (typeof value !== 'object' || value === null) return null;
  const { unit, e2e } = value as Record<string, unknown>;
  return isCount(unit) && isCount(e2e) ? { unit, e2e } : null;
}

/** The counts this build was made with. */
export function recordedCounts(): TestCounts | null {
  return __TEST_COUNTS__;
}
