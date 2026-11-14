import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { createPedigree, createSamplePedigree } from '../../../src/domain';
import { en } from '../../../src/i18n/en';
import { generatePedigree } from '../../fixtures/pedigrees';
import { familyOf25 } from '../helpers';
import { expect, test } from '../guard';
import { ROUTES, horizontalOverflow, seedOnce, seedRaw } from './helpers';

// Screens, zoom, colour modes, languages, print, accessibility.

async function serious(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/**
 * Visible buttons, links and fields that stick out past the edges of the window. Content inside
 * its own scrolling region (the comparison table) is reachable by scrolling that region, which
 * WCAG 1.4.10 allows for data tables, so it is not counted.
 */
async function clippedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>('button, a, input, select, textarea')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const hidden = box.width === 0 || style.visibility === 'hidden' || element.closest('[aria-hidden="true"], .visually-hidden, .kt-canvas__viewport');
        let scrolls = false;
        for (let parent = element.parentElement; parent && !scrolls; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowX;
          scrolls = (overflow === 'auto' || overflow === 'scroll') && parent.scrollWidth > parent.clientWidth;
        }
        return !hidden && !scrolls && (box.right > width + 1 || box.left < -1);
      })
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 40)}"`);
  });
}

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x640', width: 360, height: 640 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: 'landscape phone 740x360', width: 740, height: 360 },
  // Browser zoom of 200% and 400% on a 1280px-wide window reflows like 640 and 320 CSS pixels.
  { name: 'zoom 200%', width: 640, height: 400, deviceScaleFactor: 2 },
  { name: 'zoom 400%', width: 320, height: 200, deviceScaleFactor: 4 },
];

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: every route reflows with no sideways scrolling and no clipped controls`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    });
    const page = await context.newPage();
    await seedOnce(page, createSamplePedigree());
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await horizontalOverflow(page), `${route} scrolls sideways`).toBeLessThanOrEqual(0);
      expect(await clippedControls(page), `${route} clips controls`).toEqual([]);
    }
    await context.close();
  });
}

test('Forced colours, reduced motion and a dark preference keep the light design readable', async ({ page, problems }) => {
  // The page ends in forced-colours mode, where the system replaces every colour; axe cannot judge contrast
  // there. Contrast is checked by axe above, under the dark preference, before forced colours are switched on.
  problems.skipCheck('axe', 'forced colours replace the page colours');
  await seedOnce(page, createSamplePedigree());
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  for (const route of ROUTES) {
    await page.goto(route);
    // The design is light only, so it stays light under a dark preference, and contrast passes.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r = 0, g = 0, b = 0] = (background.match(/\d+/g) ?? []).map(Number);
    expect((r + g + b) / 3, `${route} background ${background}`).toBeGreaterThan(180);
    expect(await serious(page), route).toEqual([]);
  }
  // Reduced motion: nothing animates for longer than a blink.
  await page.goto('/');
  const longest = await page.evaluate(() =>
    Math.max(0, ...[...document.querySelectorAll('*')].map((element) => parseFloat(getComputedStyle(element).animationDuration) || 0)),
  );
  expect(longest).toBeLessThan(0.05);

  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'light', reducedMotion: 'no-preference' });
  for (const route of ['/build', '/findings', '/report']) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }
  await page.goto('/build');
  await page.locator('[data-person-id="mother"]').focus();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe('none');
});

const KEYS = Object.keys(en);
/** Raw message keys (such as "quick.label") showing on the page instead of words. */
async function rawKeys(page: Page): Promise<string[]> {
  const text = await page.locator('body').innerText();
  return KEYS.filter((key) => key.includes('.') && text.includes(key));
}

for (const locale of ['es', 'hi'] as const) {
  test(`In ${locale}: every page, no raw keys, no overflow, lang set, and the report prints on one page`, async ({ page, problems }) => {
  problems.skipCheck('layoutShift', 'switching to print layout re-lays the whole page; no user sees that as a shift');
    await seedOnce(page, createSamplePedigree());
    await page.addInitScript((code) => window.localStorage.setItem('kintrace.locale.v1', code), locale);
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await rawKeys(page), route).toEqual([]);
      expect(await horizontalOverflow(page), route).toBeLessThanOrEqual(0);
    }
    // The switch on a page changes the language there and then.
    await page.goto('/findings');
    await page.getByRole('combobox', { name: /Language|Idioma|भाषा/ }).selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
    await page.getByRole('combobox', { name: 'Language' }).selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);

    await page.goto('/report');
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
}

test('Print: one page for the sample, an almost empty, a 25-person and a 60-person family, on A4 and Letter', async ({ browser }) => {
  const parentsOnly = createPedigree({ sex: 'female', ageNow: 30 });
  const families = {
    sample: createSamplePedigree(),
    'almost empty': { ...parentsOnly, persons: { ...parentsOnly.persons, m: { id: 'm', sex: 'female' as const, deceased: false, conditions: [] } }, parentLinks: [{ childId: 'p1', parentId: 'm', kind: 'biological' as const }] },
    '25 people': familyOf25(),
    '60 people': generatePedigree(60),
  };
  for (const [name, ped] of Object.entries(families)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await seedOnce(page, ped);
    await page.goto('/report');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    for (const paper of ['a4', 'letter'] as const) {
      await page.getByLabel('Paper size').selectOption(paper);
      await page.emulateMedia({ media: 'print' });
      const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
      expect(pdf.getPageCount(), `${name} on ${paper}`).toBe(1);
      expect(Math.round(pdf.getPage(0).getWidth()), `${name} on ${paper}`).toBe(paper === 'a4' ? 595 : 612);
      await page.emulateMedia({ media: 'screen' });
    }
    await context.close();
  }
});

test('Accessibility: no serious or critical violations on any route', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    expect(await serious(page), `${route} empty`).toEqual([]);
  }
  await seedOnce(page, createSamplePedigree());
  for (const route of [...ROUTES, '/no-such-page']) {
    await page.goto(route);
    expect(await serious(page), `${route} with a family`).toEqual([]);
  }
});

test('Accessibility with an expanded card, an open drawer and error states', async ({ page }) => {
  await seedOnce(page, createSamplePedigree());
  await page.goto('/findings');
  const card = page.getByRole('button', { name: /Familial hypercholesterolaemia/ });
  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  expect(await serious(page), 'expanded card').toEqual([]);

  await page.goto('/build');
  await page.locator('[data-person-id="mother"]').click();
  const drawer = page.getByRole('complementary');
  await expect(drawer).toBeVisible();
  expect(await serious(page), 'drawer open').toEqual([]);
  await drawer.getByLabel('Current age').fill('abc');
  await expect(drawer.getByRole('alert')).toBeVisible();
  expect(await serious(page), 'field error').toEqual([]);

  await page.getByLabel('Family tree file to import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByRole('alert').filter({ hasText: 'could not be imported' })).toBeVisible();
  expect(await serious(page), 'import error').toEqual([]);
});

test('Accessibility when the saved tree could not be opened', async ({ page }) => {
  await seedRaw(page, '{broken');
  for (const route of ['/build', '/findings', '/']) {
    await page.goto(route);
    await expect(page.getByRole('alert').first()).toBeVisible();
    expect(await serious(page), route).toEqual([]);
  }
});
