import type { Page } from '@playwright/test';
import type { Condition } from '../../../src/domain';
import { generatePedigree } from '../../fixtures/pedigrees';
import { expect, test } from '../guard';
import { STORAGE_KEY, family, seedOnce } from './helpers';

// Family shapes that are easy to get wrong.

// Laterality is recorded, so the bilateral criterion (which treats a missing side as unknown) stays out of the way.
const breast = (age: number, extra: Partial<Condition> = {}): Condition => ({
  id: `b${age}`, code: 'breast', domain: 'cancer', ageAtOnset: age, ageUnknown: false, confirmed: 'confirmed', laterality: 'left', ...extra,
});
const groupTransform = (page: Page) => page.locator('.kt-canvas__svg > g').getAttribute('transform');
const card = (page: Page, name: RegExp) => page.getByRole('button', { name });

test('A 60-person family renders in under 2 seconds; pan, zoom, fit and keyboard still work', async ({ page }) => {
  const big = generatePedigree(60);
  await seedOnce(page, big);
  const start = Date.now();
  await page.goto('/build');
  await expect(page.locator('[data-person-id]')).toHaveCount(60);
  expect(Date.now() - start).toBeLessThan(2000);

  const fitted = await groupTransform(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const zoomed = await groupTransform(page);
  expect(zoomed).not.toBe(fitted);

  // Drag on empty canvas to pan.
  const box = await page.locator('.kt-canvas__viewport').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
  await page.mouse.up();
  expect(await groupTransform(page)).not.toBe(zoomed);

  await page.getByRole('button', { name: 'Fit to screen' }).click();
  expect(await groupTransform(page)).toBe(fitted);

  // Keyboard: focus the proband, move with arrows, open with Enter.
  const proband = page.locator(`[data-person-id="${big.probandId}"]`);
  await proband.focus();
  await page.keyboard.press('ArrowUp');
  const moved = await page.evaluate(() => document.activeElement?.getAttribute('data-person-id'));
  expect(moved).toBeTruthy();
  expect(moved).not.toBe(big.probandId);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toBeVisible();
});

test('Consanguineous parents (first cousins) are flagged and degrees are right', async ({ page }) => {
  // The proband's parents are first cousins: their mothers are sisters.
  await seedOnce(
    page,
    family({
      people: 'me:f mum:f dad:m gma:f gpa:m gmb:f gpb:m ggm:f ggf:m',
      bio: 'me<mum+dad mum<gma+gpa dad<gmb+gpb gma<ggm+ggf gmb<ggm+ggf',
      partners: 'mum+dad gma+gpa gmb+gpb ggm+ggf',
    }),
  );
  await page.goto('/build');
  await page.locator('[data-person-id="ggm"]').click();
  const drawer = page.getByRole('complementary');
  // A shared great-grandparent reached through both parents: flagged, and still third degree.
  await expect(drawer).toContainText(/great-grandmother/i);
  await expect(drawer.getByText('Related to you through more than one line of the family.')).toBeVisible();
  await page.locator('[data-person-id="mum"]').click();
  await expect(drawer).toContainText(/Relationship to you: Mother/);
  await expect(drawer).not.toContainText(/more than one line/i);
  // The findings say plainly that the parents are blood relatives.
  await page.goto('/findings');
  await expect(page.getByRole('note', { name: 'Your parents are blood relatives' })).toBeVisible();
});

test('Half-siblings count at second degree; step and adoptive relatives never count', { tag: '@cross-browser' }, async ({ page }) => {
  await seedOnce(
    page,
    family({
      people: 'me:f mum:f dad:m stepmum:f halfsis:f stepsis:f adoptsis:f',
      details: {
        halfsis: { conditions: [breast(35)] },
        stepsis: { conditions: [breast(30)] },
        adoptsis: { conditions: [breast(32)] },
        stepmum: { conditions: [breast(33)] },
      },
      bio: 'me<mum+dad halfsis<dad+stepmum',
      step: 'me<stepmum stepsis<mum',
      adoptive: 'adoptsis<mum+dad',
      partners: 'dad+stepmum',
      formerPartners: 'mum+dad',
    }),
  );
  await page.goto('/findings');
  const cg164 = card(page, /Familial breast cancer/);
  // Only the half-sister is a blood relative, and she is second degree, so the
  // first-degree under-40 rule is not met: no Meets criteria from step or adoptive relatives.
  await expect(cg164).toContainText('No criteria met');
  await page.locator('[data-person-id="halfsis"]').first().click();
  await expect(page.getByRole('heading', { name: 'Half-sister' })).toBeVisible();
  // Control: the same person as a full sister is first degree, and the rule is met.
  const full = family({
    people: 'me:f mum:f dad:m stepmum:f halfsis:f stepsis:f adoptsis:f',
    details: { halfsis: { conditions: [breast(35)] }, stepsis: { conditions: [breast(30)] }, adoptsis: { conditions: [breast(32)] } },
    bio: 'me<mum+dad halfsis<mum+dad',
    step: 'me<stepmum stepsis<mum',
    adoptive: 'adoptsis<mum+dad',
  });
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(full)] as const);
  await page.reload();
  await expect(card(page, /Familial breast cancer/)).toContainText('Meets criteria');
});

test('The same condition twice counts once; two different cancers each count in their own criteria', async ({ page }) => {
  await seedOnce(
    page,
    family({
      people: 'me:f mum:f dad:m',
      details: {
        // Mother: breast cancer entered twice, and ovarian cancer.
        mum: {
          conditions: [breast(45), breast(45, { id: 'dup' }), { id: 'o1', code: 'ovarian', domain: 'cancer', ageAtOnset: 50, ageUnknown: false, confirmed: 'confirmed' }],
        },
      },
      bio: 'me<mum+dad',
    }),
  );
  await page.goto('/findings');
  const cg164 = card(page, /Familial breast cancer/);
  await expect(cg164).toBeVisible();
  // One person with two breast entries is still one relative: "two relatives with breast cancer" is not met,
  // and breast plus ovarian needs two different relatives, so it is not met by the mother alone.
  await expect(cg164).toContainText('No criteria met');
  await page.locator('[data-person-id="mum"]').first().click();
  // Her two different cancers are each listed.
  await expect(page.getByText(/Breast cancer/).first()).toBeVisible();
  await expect(page.getByText(/Ovarian cancer/).first()).toBeVisible();
});

test('Breast cancer on the mother\'s and the father\'s side never combine under CG164', { tag: '@cross-browser' }, async ({ page }) => {
  await seedOnce(
    page,
    family({
      people: 'me:f mum:f dad:m pgm:f pgf:m',
      details: { mum: { conditions: [breast(45)] }, pgm: { conditions: [breast(55)] } },
      bio: 'me<mum+dad dad<pgm+pgf',
      partners: 'mum+dad pgm+pgf',
    }),
  );
  await page.goto('/findings');
  const cg164 = card(page, /Familial breast cancer/);
  await expect(cg164).toContainText('No criteria met');
  // Moving the grandmother to the mother's side makes the same two relatives meet the criterion.
  const sameSide = family({
    people: 'me:f mum:f dad:m mgm:f mgf:m',
    details: { mum: { conditions: [breast(45)] }, mgm: { conditions: [breast(55)] } },
    bio: 'me<mum+dad mum<mgm+mgf',
    partners: 'mum+dad mgm+mgf',
  });
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(sameSide)] as const);
  await page.reload();
  await expect(card(page, /Familial breast cancer/)).toContainText('Meets criteria');
});
