import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

// `npm run onepager [-- --site-url=https://...]`: fills the numbers and links in
// docs/submission/ONE_PAGER.html from the repository, prints it to ONE_PAGER.pdf with
// Chromium, and fails unless the PDF is exactly one A4 page with nothing cut off.
// Numbers come from the recorded unit count, the browser tests Playwright lists, the
// committed mutation summary and the bug write-ups, never typed by hand.

const HTML = 'docs/submission/ONE_PAGER.html';
const PDF = 'docs/submission/ONE_PAGER.pdf';
const REPO = 'https://github.com/SurabhiD2008/KinTrace';
const A4_POINTS = { width: 595.28, height: 841.89 };

const siteArg = process.argv.find((arg) => arg.startsWith('--site-url='));
const siteUrl = siteArg?.slice('--site-url='.length).replace(/\/$/, '');

function browserTotal() {
  const env = { ...process.env, E2E_BROWSERS: 'chromium,firefox,webkit', E2E_WIDTHS: '320,390,768,1024,1360' };
  const result = spawnSync('npx playwright test --list --reporter=json', { shell: true, encoding: 'utf8', env, maxBuffer: 1024 * 1024 * 64 });
  if (result.status !== 0) throw new Error('playwright --list failed');
  let total = 0;
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) total += spec.tests.length;
    for (const child of suite.suites ?? []) walk(child);
  };
  JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).suites.forEach(walk);
  return total;
}

function values() {
  const counts = JSON.parse(readFileSync('src/pages/method/test-counts.json', 'utf8'));
  const mutation = JSON.parse(readFileSync('docs/mutation-score.json', 'utf8'));
  const bugs = [...readFileSync('docs/BUGS_FOUND.md', 'utf8').matchAll(/^## BUG-\d+/gm)].length;
  return { unit: String(counts.unit), browser: String(browserTotal()), mutation: `${mutation.score}%`, bugs: String(bugs) };
}

function fill(html) {
  let out = html;
  for (const [key, value] of Object.entries(values())) {
    out = out.replace(new RegExp(`(<b data-fill="${key}">)[^<]*(</b>)`), `$1${value}$2`);
  }
  const site = siteUrl
    ? `<a data-fill="site" href="${siteUrl}">${siteUrl.replace(/^https:\/\//, '')}</a>`
    : `<a data-fill="site" href="${REPO}#deploy">deployment in progress</a>`;
  out = out.replace(/<a data-fill="site"[^>]*>[^<]*<\/a>/, site);
  return out.replace(/<a data-fill="repo"[^>]*>[^<]*<\/a>/, `<a data-fill="repo" href="${REPO}">${REPO.replace(/^https:\/\//, '')}</a>`);
}

writeFileSync(HTML, fill(readFileSync(HTML, 'utf8')));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(HTML)).href);
  await page.evaluate(() => globalThis.document.fonts.ready);
  const clipped = await page.evaluate(() => {
    const sheet = globalThis.document.querySelector('.sheet');
    const bottom = sheet.getBoundingClientRect().bottom;
    const overflowing = [...sheet.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().bottom > bottom + 0.5);
    return { sheet: sheet.scrollHeight > sheet.clientHeight, elements: overflowing.length };
  });
  if (clipped.sheet || clipped.elements > 0) throw new Error(`content runs past the page (${clipped.elements} elements)`);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  const { width, height } = pages[0].getSize();
  if (pages.length !== 1) throw new Error(`the PDF has ${pages.length} pages, not 1`);
  if (Math.abs(width - A4_POINTS.width) > 1 || Math.abs(height - A4_POINTS.height) > 1) throw new Error(`the page is ${width} x ${height} pt, not A4`);
  writeFileSync(PDF, pdf);
  process.stdout.write(`${PDF}: 1 page, A4 (${width.toFixed(0)} x ${height.toFixed(0)} pt), ${(pdf.length / 1024).toFixed(0)} KB\n`);
} finally {
  await browser.close();
}
