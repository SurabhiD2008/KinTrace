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

test('build a tree: load sample, edit, undo, reload, and pass the accessibility check', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/build');
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Load sample family' }).click();
  const mother = page.getByRole('button', { name: /^Mother, 60/ });
  await expect(mother).toBeVisible();
  await expect(page.locator('[data-person-id]')).toHaveCount(10);

  const completeness = page.getByRole('progressbar');
  const before = Number(await completeness.getAttribute('aria-valuenow'));

  // Select Mother and change the age her cancer started.
  await mother.click();
  const drawer = page.getByRole('complementary');
  await expect(drawer.getByRole('heading', { level: 2, name: 'Mother' })).toBeVisible();
  const onset = drawer.getByLabel('Age when it started');
  await expect(onset).toHaveValue('38');
  const motherNode = page.locator('[data-labels-for="mother"]');
  await expect(motherNode).toContainText('Breast 38');

  // Removing the age leaves a gap: the badge and the completeness both change.
  await onset.fill('');
  await expect(motherNode).toContainText('Breast ?');
  await expect.poll(async () => Number(await completeness.getAttribute('aria-valuenow'))).toBeLessThan(before);
  await expect(page.getByRole('link', { name: 'Fix: The age when a condition started is missing for Mother.' })).toBeVisible();

  await onset.fill('45');
  await expect(motherNode).toContainText('Breast 45');
  await expect.poll(async () => Number(await completeness.getAttribute('aria-valuenow'))).toBe(before);

  // A value that contradicts her age is refused, in words, and not saved.
  await onset.fill('70');
  await expect(drawer.getByRole('alert')).toContainText('Not saved.');
  await expect(motherNode).toContainText('Breast 45');
  await onset.fill('45');

  // The accessibility check runs with the tree, the drawer and the gaps strip on screen.
  expect(await seriousViolations(page)).toEqual([]);

  // Undo with the keyboard takes the last saved change back.
  await page.keyboard.press('Control+z');
  await expect(motherNode).toContainText('Breast ?');
  await page.keyboard.press('Control+Shift+z');
  await expect(motherNode).toContainText('Breast 45');
  await page.keyboard.press('Control+z');
  await expect(motherNode).toContainText('Breast ?');

  // The tree is saved on this device: a reload shows the same state.
  await page.reload();
  await expect(page.locator('[data-person-id]')).toHaveCount(10);
  await expect(page.locator('[data-labels-for="mother"]')).toContainText('Breast ?');
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toHaveCount(0);

  // Keyboard: Enter on a person opens their details.
  await page.locator('[data-person-id="father"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary').getByRole('heading', { level: 2, name: 'Father' })).toBeFocused();

  // Nothing was sent anywhere except this site and its font files.
  const origin = new URL(page.url()).origin;
  const outside = requests.filter(
    (url) => !url.startsWith(origin) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url),
  );
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('the builder works on a 360px-wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await page.getByRole('button', { name: /^Sister, 31/ }).click();
  await expect(page.getByRole('complementary')).toBeVisible();
  // No sideways scrolling, and the details sheet is pinned to the bottom of the screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('complementary')).toHaveCSS('position', 'fixed');
  expect(await seriousViolations(page)).toEqual([]);
});
