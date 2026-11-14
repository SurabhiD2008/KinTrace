import type { Page, Route } from '@playwright/test';
import { expect, test } from '../guard';

// With AI on, every way the AI path can fail falls back to the
// offline parser, says so, and adds nothing until the user accepts.

const TEXT = 'My mum had breast cancer at 38. Her sister had ovarian cancer at 44.';

async function startWithAiOn(page: Page) {
  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('checkbox', { name: 'Use AI for longer or non-English text' }).check();
  await page.getByLabel('Describe your family in your own words').fill(TEXT);
}

declare global {
  interface Window {
    /** When the click and the fallback notice happened, timed inside the page. */
    __fallback?: { start: number; end: number };
  }
}

const FALLBACK = 'The AI service could not be reached, so the offline parser (English only) was used instead.';

async function expectOfflineFallback(page: Page, withinMs: number) {
  // Timed inside the page, from the click to the notice appearing, so Playwright's own
  // polling and process scheduling are not counted against the app.
  await page.evaluate((text) => {
    const timing = { start: 0, end: 0 };
    window.__fallback = timing;
    document.addEventListener('click', () => void (timing.start ||= performance.now()), { capture: true, once: true });
    new MutationObserver((_records, observer) => {
      if (timing.start && document.body.textContent?.includes(text)) {
        timing.end = performance.now();
        observer.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }, FALLBACK);
  await page.getByRole('button', { name: 'Suggest entries' }).click();
  await expect(page.getByText(FALLBACK)).toBeVisible({ timeout: withinMs + 2000 });
  const elapsed = await page.evaluate(() => {
    const timing = window.__fallback;
    return timing ? timing.end - timing.start : -1;
  });
  expect(elapsed).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(withinMs);
  await expect(page.getByRole('status').filter({ hasText: 'suggestions' })).toHaveText('2 suggestions.');
  // Nothing is in the tree until it is accepted, and no suggestion is labelled AI.
  await expect(page.locator('[data-person-id]')).toHaveCount(1);
}

test('Offline with AI on: the offline parser answers, with the notice, and nothing is sent', async ({ page, context }) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/parse')) sent.push(request.url());
  });
  await startWithAiOn(page);
  await context.setOffline(true);
  await expectOfflineFallback(page, 3000);
  expect(sent).toEqual([]);
  await context.setOffline(false);
});

const FAILURES: [string, (route: Route) => Promise<void>][] = [
  ['the API returns 500', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"upstream_error"}}' })],
  ['the API returns invalid JSON', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"entries": [ not json' })],
  [
    'the API returns hostile relation keys',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          engine: 'ai',
          unparsed: [],
          entries: [{ id: 'e1', relation: 'admin', conditions: [], sourceSpan: { start: 0, end: 5 } }, { id: '__proto__', relation: 'mother', conditions: [], sourceSpan: { start: 0, end: 5 } }],
        }),
      }),
  ],
  [
    'the API offers an ambiguity option that is not a condition',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          engine: 'ai',
          unparsed: [],
          entries: [{ id: 'e1', relation: 'mother', conditions: [{ code: 'breast', ageUnknown: false, certainty: 'reported' }], sourceSpan: { start: 0, end: 5 }, ambiguity: { kind: 'condition', options: ['breast', 'admin'] } }],
        }),
      }),
  ],
];
for (const [name, respond] of FAILURES) {
  test(`${name}: falls back safely`, async ({ page, problems }) => {
    problems.allow(/\/api\/parse|status of 500/);
    await page.route('**/api/parse', respond);
    await startWithAiOn(page);
    await expectOfflineFallback(page, 3000);
  });
}

test('The API hangs for 10 seconds: falls back within 9 seconds', async ({ page, problems }) => {
  problems.allow(/\/api\/parse/);
  await page.route('**/api/parse', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => undefined);
  });
  await startWithAiOn(page);
  await expectOfflineFallback(page, 9000);
});
