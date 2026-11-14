import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './guard';
import type { Page } from '@playwright/test';

/** Serious and critical accessibility violations on the current page. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

/** Names of the people drawn with the evidence ring, sorted. */
async function ringedNames(page: Page) {
  const ids = await page
    .locator('[data-evidence="true"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-person-id') ?? ''));
  const names = await Promise.all(
    ids.map((id) => page.locator(`[data-labels-for="${id}"] .kt-node__name`).allTextContents()),
  );
  return names.map((lines) => lines.join(' ')).sort();
}

const card = (page: Page, name: RegExp) => page.getByRole('button', { name });

test('findings and compare on the sample family', async ({ page, browserName }) => {
  // WebKit on macOS moves focus to links and buttons with Option+Tab, as Safari does.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await page.getByRole('link', { name: 'See findings' }).click();
  await expect(page).toHaveURL(/\/findings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Findings' })).toBeVisible();

  // The three headline statuses.
  const cg164 = card(page, /Familial breast cancer/);
  const amsterdam = card(page, /Lynch syndrome/);
  const cg71 = card(page, /Familial hypercholesterolaemia/);
  await expect(cg164).toContainText('Meets criteria');
  await expect(amsterdam).toContainText('No criteria met');
  await expect(cg71).toContainText('Worth discussing');

  // CG164 starts open; close and open it again, then check the rings.
  await expect(cg164).toHaveAttribute('aria-expanded', 'true');
  await cg164.click();
  await expect(cg164).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-evidence="true"]')).toHaveCount(0);
  await cg164.click();
  await expect(cg164).toHaveAttribute('aria-expanded', 'true');
  expect(await ringedNames(page)).toEqual(['Maternal aunt', 'Maternal grandmother', 'Mother']);

  expect(await seriousViolations(page)).toEqual([]);

  // Keyboard only: Tab to the first card, close it, Tab to the next card and open it.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  let reached = false;
  for (let step = 0; step < 40 && !reached; step += 1) {
    await page.keyboard.press(tab);
    reached = await cg164.evaluate((element) => element === document.activeElement);
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Enter');
  await expect(cg164).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press(tab);
  await expect(cg71).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cg71).toHaveAttribute('aria-expanded', 'true');
  expect(await ringedNames(page)).toEqual(['Father']);
  // The next stop after an open card header is the first relative chip inside it.
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'Show Father on the family tree' }).first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Father', level: 3 })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Show Father on the family tree' }).first()).toBeFocused();

  // The filter is kept in the address.
  await page.getByRole('button', { name: 'Heart', exact: true }).click();
  await expect(page).toHaveURL(/\/findings\?show=heart$/);
  await expect(cg164).toHaveCount(0);

  // Compare: the golden heart table.
  await page.getByRole('link', { name: 'Compare guidelines' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Compare guidelines' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Heart', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const row = (name: string) => page.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) });
  await expect(row('NICE CG71').locator('[data-cell="result"]')).toHaveText('Worth discussing');
  await expect(row('NICE CG71').locator('[data-cell="counted"]')).toHaveText('Father');
  await expect(row('DLCN family-history item').locator('[data-cell="result"]')).toHaveText('No criteria met');
  await expect(row('DLCN family-history item').locator('[data-cell="not-counted"]')).toContainText(
    'Your father, 57: above the under-55 threshold for men',
  );
  // NG238 has no under-55 threshold for men (docs/RULES.md): the father at 57 is counted.
  await expect(row('NICE NG238').locator('[data-cell="result"]')).toHaveText('Worth discussing');
  await expect(row('NICE NG238').locator('[data-cell="counted"]')).toHaveText('Father');
  await expect(page.locator('[data-count-for="father"]')).toHaveText('2');
  await expect(page.locator('[data-evidence="true"]')).toHaveCount(1);

  expect(await seriousViolations(page)).toEqual([]);

  const origin = new URL(page.url()).origin;
  const outside = requests.filter(
    (url) => !url.startsWith(origin) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url),
  );
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('findings and compare work on a 360px-wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  for (const path of ['/findings', '/compare']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Hide the family tree' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Hide the family tree' }).click();
    await expect(page.locator('.kt-canvas__viewport')).toBeHidden();
    expect(await seriousViolations(page)).toEqual([]);
  }
});

test('an empty device shows the way to the builder', async ({ page }) => {
  await page.goto('/findings');
  await expect(page.getByRole('heading', { name: 'No family tree yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the builder' })).toHaveAttribute('href', '/build');
  expect(await seriousViolations(page)).toEqual([]);
});
