import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// `npm run screenshots`: refreshes the pictures of the website in media/. Kept apart from the
// test suite because it writes files in the repository.
export default defineConfig({
  ...base,
  testDir: 'tests/capture',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
