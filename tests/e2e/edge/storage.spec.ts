import type { Page } from '@playwright/test';
import { createSamplePedigree, serialize } from '../../../src/domain';
import { generatePedigree } from '../../fixtures/pedigrees';
import { expect, test } from '../guard';
import { STORAGE_KEY, seedRaw, stored } from './helpers';

// Reloads, broken or unavailable storage, two tabs, imports.

const people = (page: Page) => page.locator('[data-person-id]');
const startCard = (page: Page) => page.getByRole('heading', { name: 'Start your family tree' });

test('Reloading at every step of building a family keeps every step', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByLabel('Your age (optional)').fill('34');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await page.reload();
  await expect(people(page)).toHaveCount(1);
  // The "add your parents" prompt belongs to the first visit; after a reload, parents are added from the tree.
  await expect(page.getByRole('button', { name: 'Add mother' })).toHaveCount(0);
  await page.locator('[data-person-id="p1"]').click();
  await page.getByRole('button', { name: 'Add parent' }).click();
  await page.getByRole('dialog').getByLabel('Their sex').selectOption('female');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await page.reload();
  await expect(people(page)).toHaveCount(2);
  await page.locator('[data-person-id="p2"]').click();
  const drawer = page.getByRole('complementary');
  await drawer.getByLabel('Current age').fill('62');
  await page.reload();
  await page.locator('[data-person-id="p2"]').click();
  await expect(drawer.getByLabel('Current age')).toHaveValue('62');
  await drawer.getByLabel('Add a condition').selectOption({ label: 'Breast cancer' });
  await drawer.getByRole('button', { name: 'Add condition' }).click();
  await drawer.getByLabel('Age when it started').fill('38');
  await page.reload();
  await expect(page.locator('[data-labels-for="p2"]')).toContainText('Breast 38');
  await page.getByRole('link', { name: 'See findings' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /Familial breast cancer/ })).toContainText('Meets criteria');
});

const BROKEN: [string, string][] = [
  ['random text', 'not json at all {{{'],
  ['an old schema version', JSON.stringify({ ...createSamplePedigree(), version: 0 })],
  ['valid JSON of the wrong shape', JSON.stringify({ hello: 'world', persons: [1, 2, 3], version: 1 })],
  ['a value over the size limit', `"${'x'.repeat(3 * 1024 * 1024)}"`],
];
for (const [name, value] of BROKEN) {
  test(`Corrupted storage (${name}) recovers with a visible notice and no white screen`, { tag: '@cross-browser' }, async ({ page }) => {
    await seedRaw(page, value);
    for (const route of ['/build', '/findings', '/']) {
      await page.goto(route);
      await expect(page.getByRole('alert').filter({ hasText: 'could not be opened' })).toBeVisible();
      await expect(page.locator('h1').first()).toBeVisible();
    }
    await page.goto('/build');
    await expect(startCard(page)).toBeVisible();
    // Starting again works and replaces the broken copy.
    await page.getByRole('button', { name: 'Load sample family' }).click();
    await expect(people(page)).toHaveCount(10);
    expect((await stored(page))?.version).toBe(1);
  });
}

test('A 6 MB stored value is refused with a notice', { tag: '@cross-browser' }, async ({ page }) => {
  // Browsers cap storage at about 5 MB, so the oversized value may not even be written;
  // either way the app must open with no white screen.
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, 'x'.repeat(6 * 1024 * 1024));
    } catch {
      window.localStorage.setItem(key, 'x'.repeat(2 * 1024 * 1024 + 10));
    }
  }, STORAGE_KEY);
  await page.goto('/build');
  await expect(page.getByRole('alert').filter({ hasText: 'could not be opened' })).toBeVisible();
  await expect(startCard(page)).toBeVisible();
});

test('Blocked storage keeps the app usable in memory, with a notice', { tag: '@cross-browser' }, async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is disabled', 'SecurityError');
      },
    });
  });
  await page.goto('/build');
  await expect(page.getByRole('alert').filter({ hasText: 'not letting KinTrace save' })).toBeVisible();
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await expect(people(page)).toHaveCount(10);
  // The page no longer claims the tree is saved on this device.
  await expect(page.getByText('Your family tree is saved on this device only.')).toHaveCount(0);
  await page.getByRole('link', { name: 'See findings' }).click();
  await expect(page.getByRole('button', { name: /Familial breast cancer/ })).toContainText('Meets criteria');
});

test('A full storage quota keeps the app usable, with a notice', { tag: '@cross-browser' }, async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(this: Storage, name: string, value: string) {
      if (name === key) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, STORAGE_KEY);
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await expect(people(page)).toHaveCount(10);
  await expect(page.getByRole('alert').filter({ hasText: 'could not be saved on this device' })).toBeVisible();
  await page.locator('[data-person-id="mother"]').click();
  await page.getByRole('complementary').getByLabel('Age when it started').fill('39');
  await expect(page.locator('[data-labels-for="mother"]')).toContainText('Breast 39');
});

test('Two tabs: a change in tab A makes tab B ask before anything is overwritten', async ({ context, problems }) => {
  // The notice about another tab appears at the top, where it is seen, and moves the page down a little.
  problems.skipCheck('layoutShift', 'the other-tab notice is inserted at the top on purpose');
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await tabA.goto('/build');
  await tabA.getByRole('button', { name: 'Load sample family' }).click();
  await tabB.goto('/build');
  await expect(people(tabB)).toHaveCount(10);

  // Tab A changes the mother's onset age.
  await tabA.locator('[data-person-id="mother"]').click();
  await tabA.getByRole('complementary').getByLabel('Age when it started').fill('41');
  const notice = tabB.getByRole('alert').filter({ hasText: 'Another tab changed this tree.' });
  await expect(notice).toBeVisible();

  // Tab B edits anyway: its edit stays on its screen but does not overwrite tab A's save.
  await tabB.locator('[data-person-id="father"]').click();
  await tabB.getByRole('complementary').getByLabel('Current age').fill('66');
  expect((await stored(tabA))?.persons.mother?.conditions[0]?.ageAtOnset).toBe(41);
  expect((await stored(tabA))?.persons.father?.ageNow).not.toBe(66);

  // Reload in tab B shows tab A's tree.
  await notice.getByRole('button', { name: 'Reload' }).click();
  await expect(notice).toHaveCount(0);
  await expect(tabB.locator('[data-labels-for="mother"]')).toContainText('Breast 41');
});

async function importFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByLabel('Family tree file to import').setInputFiles({ name, mimeType, buffer });
}

test('Imports: wrong type, empty, 5 MB, 501 people and a future version are refused with a clear message', async ({ page }) => {
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  const before = await stored(page);
  const failure = page.getByRole('alert').filter({ hasText: 'That file could not be imported' });

  const cases: [string, string, Buffer, RegExp][] = [
    ['photo.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), /not valid JSON/],
    ['empty.json', 'application/json', Buffer.alloc(0), /not valid JSON/],
    ['huge.json', 'application/json', Buffer.alloc(5 * 1024 * 1024, 0x20), /larger than 2 MB/],
    ['crowd.json', 'application/json', Buffer.from(serialize({ ...generatePedigree(60), persons: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`x${i}`, { id: `x${i}`, sex: 'unknown', deceased: false, conditions: [] }])) })), /more than 500 people/],
    ['future.json', 'application/json', Buffer.from(serialize({ ...createSamplePedigree(), version: 99 })), /newer version of KinTrace/],
  ];
  for (const [name, type, buffer, message] of cases) {
    await importFile(page, name, type, buffer);
    await expect(failure).toContainText(message);
    expect(await stored(page)).toEqual(before);
    await failure.getByRole('button', { name: 'Dismiss' }).click();
  }
  await expect(people(page)).toHaveCount(10);
});
