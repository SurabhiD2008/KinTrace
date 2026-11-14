import { readFileSync } from 'node:fs';
import { expect, test } from './guard';
import type { Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { createSamplePedigree } from '../../src/domain';
import { familyOf25, namedSample, seed, seriousViolations } from './helpers';

/** The report printed the way "Save as PDF" prints it: print media, the page's own @page size. */
async function printedPdf(page: Page): Promise<Buffer> {
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  return pdf;
}

const pageCount = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();

async function pdfText(pdf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  let text = '';
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  }
  return text;
}

test('the sample report prints on exactly one page, on A4 and on US Letter, with selectable text', async ({ page, problems }) => {
  problems.skipCheck('layoutShift', 'switching to print layout re-lays the whole page; no user sees that as a shift');
  await seed(page, createSamplePedigree());
  await page.goto('/report');
  await expect(page.getByRole('heading', { level: 1, name: 'Family health history summary' })).toBeVisible();
  const a4 = await printedPdf(page);
  expect(await pageCount(a4)).toBe(1);
  const size = (await PDFDocument.load(a4)).getPage(0).getSize();
  expect(Math.round(size.width)).toBe(595); // A4 in points
  // Headings print in capitals (CSS), so compare without case; what matters is that the text is real, selectable text.
  const text = (await pdfText(a4)).toLowerCase();
  expect(text).toContain('family health history summary');
  expect(text).toContain('questions to ask your doctor');

  await page.getByLabel('Paper size').selectOption('letter');
  const letter = await printedPdf(page);
  expect(await pageCount(letter)).toBe(1);
  expect(Math.round((await PDFDocument.load(letter)).getPage(0).getSize().width)).toBe(612); // Letter in points
  expect(await seriousViolations(page)).toEqual([]);
});

test('a 25-relative family still prints on one page, the tree drawn smaller', async ({ page, problems }) => {
  problems.skipCheck('layoutShift', 'switching to print layout re-lays the whole page; no user sees that as a shift');
  const family = familyOf25();
  expect(Object.keys(family.persons)).toHaveLength(26);
  await seed(page, family);
  await page.goto('/report');
  await expect(page.locator('[data-static-person]')).toHaveCount(26);
  expect(await pageCount(await printedPdf(page))).toBe(1);
  await page.getByLabel('Paper size').selectOption('letter');
  expect(await pageCount(await printedPdf(page))).toBe(1);
});

test('Hide names removes every typed name from the page and from the PDF', async ({ page, problems }) => {
  problems.skipCheck('layoutShift', 'switching to print layout re-lays the whole page; no user sees that as a shift');
  const { ped, names } = namedSample();
  await seed(page, ped);
  await page.goto('/report');
  // The check is meaningful: with names shown, they are in the PDF text.
  const shown = await pdfText(await printedPdf(page));
  expect(names.some((name) => shown.includes(name))).toBe(true);

  await page.getByRole('checkbox', { name: 'Hide names' }).check();
  const html = await page.content();
  for (const name of names) expect(html).not.toContain(name);
  const hidden = await pdfText(await printedPdf(page));
  for (const name of names) expect(hidden).not.toContain(name);
  expect(hidden).toContain('Mother (38)');
});

test('Download JSON loads back cleanly in the builder', async ({ page }) => {
  await seed(page, createSamplePedigree());
  await page.goto('/report');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()]);
  const file = await download.path();
  expect(download.suggestedFilename()).toBe('kintrace-family-tree.json');
  const json = readFileSync(file, 'utf8');

  await page.goto('/build');
  await page.getByRole('button', { name: 'Clear everything' }).click();
  await page.getByRole('button', { name: 'Yes, clear everything' }).click();
  await page.getByLabel('Family tree file to import').setInputFiles({ name: 'tree.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.locator('[data-person-id]')).toHaveCount(10);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Copy as plain text puts the three headline findings on the clipboard', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  } else {
    // Firefox and WebKit have no clipboard permission to grant in automation; record what the
    // page writes instead, which is the behaviour under test.
    await page.addInitScript(() => {
      let copied = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => void (copied = text), readText: async () => copied },
      });
    });
  }
  await seed(page, createSamplePedigree());
  await page.goto('/report');
  await page.getByRole('button', { name: 'Copy as plain text' }).click();
  await expect(page.locator('.kt-report__status')).toHaveText('Copied.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('NICE CG164: Meets criteria');
  expect(copied).toContain('Amsterdam II: No criteria met');
  expect(copied).toContain('NICE CG71: Worth discussing');
});

test('an empty device gets the builder link, never a blank report', async ({ page }) => {
  await page.goto('/report');
  await expect(page.getByRole('link', { name: 'Go to the builder' })).toBeVisible();
  await expect(page.locator('.kt-paper')).toHaveCount(0);
});
