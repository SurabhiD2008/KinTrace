import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);

/**
 * A deployed instance to test instead of the local production build, for the production
 * smoke run (for example BASE_URL=https://your-app.vercel.app). When set, no local server
 * is started.
 */
const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '');

/** Browsers to run, comma-separated; all three by default. */
const BROWSERS = (process.env.E2E_BROWSERS ?? 'chromium,firefox,webkit').split(',').map((name) => name.trim());

/**
 * Widths for the main flows (`verify:final` sets all five). Each becomes a Chromium project
 * that runs the main flows at that width with the browser guard.
 */
const WIDTHS = (process.env.E2E_WIDTHS ?? '').split(',').filter(Boolean).map(Number);
const MAIN_FLOWS = ['smoke.spec.ts', 'builder.smoke.spec.ts', 'findings.spec.ts', 'quickadd.spec.ts', 'report.spec.ts', 'landing.spec.ts', 'edge/states.spec.ts', 'edge/keyboard.spec.ts'];

/** The smoke, findings and report flows, and the edge tests tagged @cross-browser. */
const CROSS_BROWSER = /(smoke|findings|report)\.spec\.ts|@cross-browser/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Firefox and WebKit run the smoke, findings and report flows and the edge tests tagged
    // @cross-browser. PDF output (page.pdf) exists only in Chromium, so the
    // print checks stay there.
    ...(['firefox', 'webkit'] as const).map((name) => ({
      name,
      use: { ...devices[name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'] },
      testMatch: [
        'smoke.spec.ts',
        'findings.spec.ts',
        'report.spec.ts',
        'edge/states.spec.ts',
        'edge/family.spec.ts',
        'edge/input.spec.ts',
        'edge/storage.spec.ts',
        'edge/keyboard.spec.ts',
      ],
      grep: CROSS_BROWSER,
      grepInvert: /prints on|from the PDF|PDF page/,
    })),
    ...WIDTHS.map((width) => ({
      name: `chromium@${width}`,
      use: { ...devices['Desktop Chrome'], viewport: { width, height: 900 } },
      testMatch: MAIN_FLOWS,
      grepInvert: /prints on|from the PDF|PDF page/,
    })),
  ].filter((project) => BROWSERS.includes(project.name) || project.name.startsWith('chromium@')),
  // End-to-end tests run against the production build, not the dev server; with BASE_URL
  // they run against that deployed site instead and start nothing.
  ...(BASE_URL
    ? {}
    : {
        webServer: {
          command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
          url: `http://localhost:${PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
