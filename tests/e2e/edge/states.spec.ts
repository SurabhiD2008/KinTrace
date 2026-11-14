import { createPedigree } from '../../../src/domain';
import { expect, test } from '../guard';
import { ROUTES, family, seedOnce, stored } from './helpers';

// Empty and near-empty states, adoption, navigation, clearing.

test('Every route renders its empty state with no tree on the device', { tag: '@cross-browser' }, async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();
  }
  await page.goto('/findings');
  await expect(page.getByRole('heading', { name: 'No family tree yet' })).toBeVisible();
  await page.goto('/compare');
  await expect(page.getByRole('heading', { name: 'No family tree yet' })).toBeVisible();
  await page.goto('/report');
  await expect(page.getByRole('link', { name: 'Go to the builder' })).toBeVisible();
  await page.goto('/build');
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
});

test('With only the proband, findings and report say nothing can be checked yet', { tag: '@cross-browser' }, async ({ page }) => {
  await seedOnce(page, createPedigree({ sex: 'female', ageNow: 40 }));
  for (const route of ['/findings', '/report']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Nothing can be checked yet' })).toBeVisible();
    await expect(page.getByText('Meets criteria')).toHaveCount(0);
  }
});

test('Relatives with nothing known are shown as unknown, never as a healthy family', { tag: '@cross-browser' }, async ({ page }) => {
  const unknown = { vitalStatusUnknown: true, healthHistoryUnknown: true };
  await seedOnce(
    page,
    family({
      people: 'me:f mum:u dad:u mgm:u mgf:u pgm:u pgf:u',
      details: { mum: unknown, dad: unknown, mgm: unknown, mgf: unknown, pgm: unknown, pgf: unknown },
      bio: 'me<mum+dad mum<mgm+mgf dad<pgm+pgf',
    }),
  );
  await page.goto('/findings');
  await expect(page.getByRole('heading', { level: 1, name: 'Findings' })).toBeVisible();
  // No criteria are met, and the page never says the family is healthy or clear.
  await expect(page.getByText(/\b(is|are|looks?|seems?) healthy\b|all clear|no family history/i)).toHaveCount(0);
  await expect(page.getByText('Missing information is never treated as healthy.').first()).toBeVisible();
  const progress = page.getByRole('progressbar').first();
  expect(Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(50);
  await page.goto('/build');
  await expect(page.getByText(/The health history of .* is not known\./).first()).toBeVisible();
});

test('An adopted-in proband with unknown biological parents is told their biological history is unknown', async ({ page }) => {
  await seedOnce(
    page,
    family({
      people: 'me:f amum:f adad:m',
      details: { amum: { conditions: [{ id: 'c1', code: 'breast', domain: 'cancer', ageAtOnset: 35, ageUnknown: false, confirmed: 'confirmed' }] } },
      adoptive: 'me<amum+adad',
      partners: 'amum+adad',
    }),
  );
  for (const route of ['/findings', '/report']) {
    await page.goto(route);
    const note = page.getByRole('note', { name: 'Your biological family history is not known' });
    await expect(note).toBeVisible();
    await expect(note).toContainText('nothing about them is assumed to be healthy');
    // The adoptive mother's breast cancer at 35 never counts.
    await expect(page.getByText('Meets criteria')).toHaveCount(0);
  }
  await page.goto('/findings');
  await expect(page.getByText('A biological parent is not recorded for you.').first()).toBeVisible();
});

test('Back and forward keep the tree and the page state', async ({ page }) => {
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await page.getByRole('link', { name: 'See findings' }).click();
  await expect(page).toHaveURL(/\/findings$/);
  await page.getByRole('button', { name: 'Heart', exact: true }).click();
  await expect(page).toHaveURL(/show=heart/);
  await page.goBack();
  await expect(page).toHaveURL(/\/findings$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/build$/);
  await expect(page.locator('[data-person-id]')).toHaveCount(10);
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/show=heart/);
  await expect(page.getByRole('button', { name: 'Heart', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('A nonsense query, an unknown route and a direct /report with no data are all handled', async ({ page }) => {
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  for (const query of ['?g=nonsense', '?show=nonsense', '?show=%3Cscript%3E', '?show=heart&show=cancer']) {
    await page.goto(`/findings${query}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Findings' })).toBeVisible();
  }
  await page.goto('/findings?show=nonsense');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'KinTrace home' })).toHaveText('KinTrace');
  await page.getByRole('link', { name: 'Back to the start' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/report');
  await expect(page.getByRole('link', { name: 'Go to the builder' })).toBeVisible();
});

test('Clear everything removes the saved copy and the tree, and the start card returns', async ({ page }) => {
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await expect.poll(() => stored(page)).not.toBeNull();
  await page.getByRole('button', { name: 'Clear everything' }).click();
  await page.getByRole('button', { name: 'Yes, clear everything' }).click();
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  expect(await stored(page)).toBeNull();
  await expect(page.locator('[data-person-id]')).toHaveCount(0);
  // Undo cannot bring it back, and neither can a reload.
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  await page.goto('/findings');
  await expect(page.getByRole('heading', { name: 'No family tree yet' })).toBeVisible();
});
