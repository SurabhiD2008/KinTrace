import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// `npm run screenshots`: saves full-page pictures of the website in test-results/screenshots/
// for review. Kept apart from the test suite because it is not a check.
export default defineConfig({
  ...base,
  testDir: 'tests/capture',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
