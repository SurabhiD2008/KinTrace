import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Request } from '@playwright/test';
import { createSamplePedigree, serialize } from '../../../src/domain';
import { expect, test } from '../guard';

// the privacy claim (nothing leaves the device) and the security headers.

/** Records every request the page makes, with its origin. */
function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  return requests;
}

async function fullFlow(page: Page) {
  await page.goto('/');
  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByLabel('Describe your family in your own words').fill('My mum had breast cancer at 38. My dad had a heart attack at 57.');
  await page.getByRole('button', { name: 'Suggest entries' }).click();
  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.locator('[data-labels-for]').filter({ hasText: 'Breast 38' })).toHaveCount(1);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  await download;
  await page.getByLabel('Family tree file to import').setInputFiles({
    name: 'family.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serialize(createSamplePedigree())),
  });
  await expect(page.locator('[data-person-id]')).toHaveCount(10);

  await page.getByRole('link', { name: 'See findings' }).click();
  await page.getByRole('button', { name: /Familial hypercholesterolaemia/ }).click();
  await page.getByRole('link', { name: 'Compare guidelines' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Report for your doctor' }).click();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('es');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('hi');
  await page.goto('/method');
}

test('a full flow with AI off makes no request to any other origin', async ({ page, baseURL }) => {
  const requests = recordRequests(page);
  await fullFlow(page);
  const origin = new URL(baseURL ?? '').origin;
  const outside = requests.map((r) => r.url()).filter((url) => !url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:'));
  expect(outside).toEqual([]);
  // AI is off, so the parser endpoint is never called.
  expect(requests.filter((r) => r.url().includes('/api/'))).toEqual([]);
});

test('with AI on, the only extra request is the same-origin /api/parse', async ({ page, baseURL, problems }) => {
  problems.allow(/\/api\/parse/);
  const requests = recordRequests(page);
  // The preview server has no serverless function; answer as the real one would when its key is missing.
  await page.route('**/api/parse', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"unavailable"}}' }));
  problems.allow(/status of 503/);
  await page.goto('/build');
  await page.getByRole('button', { name: 'Load sample family' }).click();
  await page.getByRole('checkbox', { name: 'Use AI for longer or non-English text' }).check();
  await page.getByLabel('Describe your family in your own words').fill('My aunt had bowel cancer at 45.');
  await page.getByRole('button', { name: 'Suggest entries' }).click();
  await expect(page.getByText(/offline parser/)).toBeVisible();
  const origin = new URL(baseURL ?? '').origin;
  const outside = requests.map((r) => r.url()).filter((url) => !url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:'));
  expect(outside).toEqual([]);
  const api = requests.filter((r) => r.url().includes('/api/'));
  expect(api.map((r) => new URL(r.url()).pathname)).toEqual(['/api/parse']);
  // The request carries only the text and the language: no tree, no names, no ids.
  const body = JSON.parse(api[0]?.postData() ?? '{}') as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['locale', 'text']);
});

test('the preview serves the security headers from vercel.json on pages and assets', async ({ request }) => {
  const page = await request.get('/');
  const html = await page.text();
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1] ?? '/';
  for (const path of ['/', '/build', '/no/such/page', asset]) {
    const response = await request.get(path);
    const headers = response.headers();
    const csp = headers['content-security-policy'] ?? '';
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).toContain("script-src 'self'");
    expect(csp, path).not.toContain('unsafe-inline');
    expect(csp, path).not.toContain('unsafe-eval');
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('no-referrer');
    expect(headers['permissions-policy'], path).toContain('camera=()');
  }
  // No inline script in the built page.
  expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

test('the build contains no API keys, key names or values from .env', () => {
  const files = filesUnder('dist').filter((path) => /\.(js|css|html|json|map|txt)$/.test(path));
  expect(files.length).toBeGreaterThan(0);
  const text = files.map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const pattern of [/sk-ant/i, /ANTHROPIC/, /NVIDIA_API_KEY/, /nvapi-/i, /PARSER_MODEL/, /Bearer\s+[A-Za-z0-9._-]{12,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/]) {
    expect(pattern.test(text), `dist matches ${pattern}`).toBe(false);
  }
  // Any real value from a local .env must not be in the bundle (checked without printing it).
  if (existsSync('.env')) {
    const values = readFileSync('.env', 'utf8')
      .split('\n')
      .map((line) => line.replace(/^[A-Z0-9_]+=/, '').trim())
      .filter((value) => value.length >= 12);
    const leaked = values.filter((value) => text.includes(value)).length;
    expect(leaked, 'values from .env found in dist').toBe(0);
  }
});
