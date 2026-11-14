import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PAGE_WATCHERS, inspectPage, watchEvents } from './guard';

// Proves that each check of the browser guard fires: one small page per check with
// the fault planted, and one clean page that must pass every check. These tests use
// plain Playwright, not the guard itself, because their pages are faulty on purpose.

const BUTTON = 'style="min-width:48px;min-height:48px"';

async function serve(page: Page, body: string, { lang = 'en', script = '' } = {}) {
  await page.context().addInitScript(PAGE_WATCHERS);
  await page.route('**/guard-selftest', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="${lang}"><head><title>Self-test</title><meta name="viewport" content="width=device-width"></head><body><main><h1>Self-test</h1>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`,
    }),
  );
  await page.goto('/guard-selftest');
}

test('a clean page passes every check', async ({ page }) => {
  await serve(page, `<p>Plain text.</p><button ${BUTTON}>Big enough</button>`);
  expect(await inspectPage(page)).toEqual([]);
});

const CASES: [string, string, { lang?: string; script?: string }, RegExp][] = [
  ['horizontal overflow', '<div style="width:5000px">wide</div>', {}, /^overflow:/],
  ['clipped text', '<p style="width:40px;overflow:hidden;white-space:nowrap">This sentence is far too long for its box</p>', {}, /^clipped text:/],
  ['a small tap target', '<button style="width:20px;height:20px;padding:0">x</button>', {}, /^small target/],
  ['an accessibility violation', `<button ${BUTTON}></button><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`, {}, /^axe /],
  ['a missing lang attribute', '<p>Text</p>', { lang: '' }, /^missing lang/],
];
for (const [name, body, options, finding] of CASES) {
  test(`the guard reports ${name}`, async ({ page }) => {
    await serve(page, body, options);
    expect(await inspectPage(page)).toEqual(expect.arrayContaining([expect.stringMatching(finding)]));
  });
}

test('the guard reports layout shift', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Layout-shift entries exist only in Chromium.');
  await serve(page, '<p id="below" style="height:300px">Content</p>', {
    script: "setTimeout(() => { const block = document.createElement('div'); block.style.height = '400px'; document.querySelector('main').prepend(block); }, 300);",
  });
  await page.waitForTimeout(600);
  expect(await inspectPage(page, new Set(['axe']))).toEqual(expect.arrayContaining([expect.stringMatching(/^layout shift/)]));
});

test('the guard reports lost focus', async ({ page }) => {
  await serve(page, `<button id="gone" ${BUTTON} onclick="this.remove()">Remove me</button>`);
  await page.locator('#gone').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect(await inspectPage(page, new Set(['axe']))).toEqual(expect.arrayContaining([expect.stringMatching(/^lost focus/)]));
});

test('the guard records console errors, page errors and failed requests', async ({ page, context }) => {
  const found: string[] = [];
  watchEvents(context, found, () => false);
  // The preview server answers unknown paths with the app page, so the faults are planted with routes.
  await page.route('**/no-such-file.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/unreachable.json', (route) => route.abort('failed'));
  await serve(page, '<p>Text</p>', {
    script: "console.error('planted'); fetch('/no-such-file.json'); fetch('/unreachable.json').catch(() => undefined); setTimeout(() => { throw new Error('planted crash'); }, 0);",
  });
  await page.waitForTimeout(500);
  expect(found).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^console\.error: planted/),
      expect.stringMatching(/^page error: planted crash/),
      expect.stringMatching(/^HTTP 404:.*no-such-file/),
      expect.stringMatching(/^request failed:.*unreachable/),
    ]),
  );
});
