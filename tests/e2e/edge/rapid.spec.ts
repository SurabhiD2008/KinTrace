import { expect, test } from '../guard';
import { stored } from './helpers';

// Rapid and repeated actions must not duplicate or corrupt anything.

const people = (page: import('@playwright/test').Page) => page.locator('[data-person-id]');

test('Double-clicking Add mother, Add father, Add partner or a dialog\'s Add adds exactly one person each', async ({ page }) => {
  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await expect(people(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Add mother' }).dblclick();
  await expect(people(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Add father' }).dblclick();
  await expect(people(page)).toHaveCount(3);
  const saved = await stored(page);
  const sexes = Object.values(saved?.persons ?? {}).map((p) => p.sex).sort();
  expect(sexes).toEqual(['female', 'female', 'male']);

  // Add partner, double-clicked, adds one partner (not a partner's partner).
  await page.locator('[data-person-id="p1"]').click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Add partner' }).dblclick();
  await expect(people(page)).toHaveCount(4);

  // A dialog's Add, double-clicked, adds one child.
  await page.locator('[data-person-id="p1"]').click();
  await page.getByRole('button', { name: 'Add child' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).dblclick();
  await expect(people(page)).toHaveCount(5);
  await page.waitForTimeout(300);
  await expect(people(page)).toHaveCount(5);
});

test('100 undo presses then 100 redo presses land exactly at the start and the end', async ({ page }) => {
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await page.locator('[data-person-id="mother"]').click();
  const onset = page.getByRole('complementary').getByLabel('Age when it started');
  for (const age of ['39', '40', '41', '42', '43']) await onset.fill(age);
  const end = await stored(page);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Control+z', { delay: 0 });
  for (let i = 1; i < 100; i += 1) await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  for (let i = 0; i < 100; i += 1) await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
  expect(await stored(page)).toEqual(end);
  await expect(page.locator('[data-labels-for="mother"]')).toContainText('Breast 43');
});

test('Spamming Accept all adds each suggestion once', async ({ page }) => {
  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByLabel('Describe your family in your own words').fill('My mum had breast cancer at 38. Her sister had ovarian cancer at 44.');
  await page.getByRole('button', { name: 'Suggest entries' }).click();
  const accept = page.getByRole('button', { name: 'Accept all' });
  await expect(accept).toBeVisible();
  await Promise.all(Array.from({ length: 8 }, () => accept.click({ force: true, noWaitAfter: true }).catch(() => undefined)));
  await expect(page.locator('.kt-suggestion')).toHaveCount(0);
  const saved = await stored(page);
  const withCondition = Object.values(saved?.persons ?? {}).filter((p) => p.conditions.length > 0);
  expect(withCondition.map((p) => p.conditions.map((c) => `${c.code}@${c.ageAtOnset}`)).flat().sort()).toEqual(['breast@38', 'ovarian@44']);
  // One undo takes the whole batch back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(people(page)).toHaveCount(1);
});

test('Switching guideline 30 times and rapid route changes leave a working page', async ({ page }) => {
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  const select = page.getByLabel('Guideline');
  const options = await select.locator('option').evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  for (let i = 0; i < 30; i += 1) await select.selectOption(options[i % options.length] ?? '');
  await expect(select).toHaveValue(options[29 % options.length] ?? '');

  // Each navigation starts before the last page has finished loading.
  for (const route of ['/findings', '/compare', '/report', '/build', '/method', '/findings?show=heart', '/', '/report', '/findings']) {
    await page.goto(route, { waitUntil: 'commit' });
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Findings' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Familial breast cancer/ })).toContainText('Meets criteria');
  expect((await stored(page))?.persons.mother?.conditions[0]?.ageAtOnset).toBe(38);
});
