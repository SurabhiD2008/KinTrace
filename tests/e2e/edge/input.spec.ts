import type { Page } from '@playwright/test';
import { expect, test } from '../guard';
import { stored } from './helpers';

// Ages, hostile names and notes, and Quick add input: everything stays valid and inert.

const XSS = '<img src=x onerror=alert(1)>';
const JS_URL = 'javascript:alert(document.domain)';

async function startWithMother(page: Page) {
  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await page.getByRole('button', { name: 'Add mother' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.locator('[data-person-id="p2"]').click();
  const drawer = page.getByRole('complementary');
  await expect(drawer.getByRole('heading', { level: 2, name: 'Mother' })).toBeVisible();
  return drawer;
}

/** Fails the test if any dialog (alert, confirm, prompt) ever opens, or an injected element appears. */
function watchForInjection(page: Page) {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  return {
    async check() {
      expect(dialogs).toEqual([]);
      expect(await page.locator('img[src="x"], script:not([src]), a[href^="javascript:"]').count()).toBe(0);
    },
  };
}

test('Ages: 0 and 120 accepted; bad values refused with a message; onset after death or after current age blocked', { tag: '@cross-browser' }, async ({ page }) => {
  const drawer = await startWithMother(page);
  const age = drawer.getByLabel('Current age');
  const error = drawer.getByRole('alert');
  const saved = async () => (await stored(page))?.persons.p2?.ageNow;

  for (const ok of ['0', '120']) {
    await age.fill(ok);
    await expect(error).toHaveCount(0);
    await expect.poll(saved).toBe(Number(ok));
  }
  for (const bad of ['121', '-1', '12.5', 'abc', '٣٨', '1e2']) {
    await age.fill(bad);
    await expect(error).toContainText('Not saved.');
    await expect.poll(saved).toBe(120);
  }
  await age.fill(' 5 ');
  await expect(error).toHaveCount(0);
  await expect.poll(saved).toBe(5);
  await age.fill('');
  await expect(error).toHaveCount(0);
  await expect.poll(saved).toBeUndefined();

  // Onset after the age at death is refused.
  await drawer.getByLabel('Living or deceased').selectOption('deceased');
  await drawer.getByLabel('Age at death').fill('50');
  await drawer.getByLabel('Add a condition').selectOption({ label: 'Breast cancer' });
  await drawer.getByRole('button', { name: 'Add condition' }).click();
  const onset = drawer.getByLabel('Age when it started');
  await onset.fill('60');
  await expect(drawer.getByRole('alert')).toContainText('Not saved.');
  await onset.fill('45');
  await expect(drawer.getByRole('alert')).toHaveCount(0);

  // Onset after the current age is refused too.
  await drawer.getByLabel('Living or deceased').selectOption('living');
  await drawer.getByLabel('Current age').fill('40');
  await expect(drawer.getByRole('alert')).toContainText('Not saved.');
  await drawer.getByLabel('Current age').fill('46');
  await expect(drawer.getByRole('alert')).toHaveCount(0);
  const mother = (await stored(page))?.persons.p2;
  expect(mother?.ageNow).toBe(46);
  expect(mother?.conditions[0]?.ageAtOnset).toBe(45);
});

test('Names and notes with markup, prototype words, emoji, right-to-left text and 10000 characters stay inert', async ({ page }) => {
  const injection = watchForInjection(page);
  const drawer = await startWithMother(page);
  const name = drawer.getByLabel('Name or label');
  const notes = drawer.getByLabel('Notes');
  for (const value of ['__proto__', 'constructor', 'toString', '👩‍👩‍👧‍👦 Mãe', 'أمي فاطمة', JS_URL, XSS]) {
    await name.fill(value);
    await expect.poll(async () => (await stored(page))?.persons.p2?.displayName).toBe(value);
  }
  // 10000 characters: the field keeps the stored limit (80 for a name, 2000 for notes).
  await notes.fill('n'.repeat(10_000));
  await name.fill('x'.repeat(10_000));
  const mother = (await stored(page))?.persons.p2;
  expect(mother?.displayName).toHaveLength(80);
  expect(mother?.notes).toHaveLength(2000);
  await notes.fill(`${XSS} ${JS_URL}`);
  await name.fill(XSS);

  // The prototype is untouched, the tree reloads, and every page shows the text as text.
  expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'))).toBe(false);
  await page.reload();
  await expect(page.getByText(XSS).first()).toBeVisible();
  for (const route of ['/findings', '/compare', '/report']) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await injection.check();
  }
  await page.goto('/report');
  await expect(page.getByText(XSS).first()).toBeVisible();

  // The exported JSON carries the text as a plain string.
  await page.goto('/build');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const file = await (await download).path();
  const { readFileSync } = await import('node:fs');
  const exported = JSON.parse(readFileSync(file, 'utf8')) as { persons: Record<string, { displayName?: string; notes?: string }> };
  expect(exported.persons.p2?.displayName).toBe(XSS);
  expect(exported.persons.p2?.notes).toBe(`${XSS} ${JS_URL}`);
  await injection.check();
});

test('Quick add: whitespace, 2000 and 10000 characters, emoji only, right-to-left text and pasted HTML', async ({ page }) => {
  const injection = watchForInjection(page);
  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  const box = page.getByLabel('Describe your family in your own words');
  const suggest = page.getByRole('button', { name: 'Suggest entries' });

  await box.fill('   \n\t  ');
  await suggest.click();
  await expect(page.getByText('Write something first, then ask for suggestions.')).toBeVisible();

  await box.fill('My mum had breast cancer at 38. '.repeat(70).slice(0, 2000));
  await suggest.click();
  await expect(page.getByRole('status').filter({ hasText: 'suggestion' })).toBeVisible();
  await expect(page.locator('[data-person-id]')).toHaveCount(1);

  // Typing past the limit is refused with a message, not sent or parsed.
  await box.fill('x'.repeat(10_000));
  await expect(page.getByText(/more than 2[,.]?000 characters/)).toBeVisible();

  for (const text of ['🎗️👩‍⚕️🧬💔', 'أمي أصيبت بسرطان الثدي في سن 38', `${XSS}<script>alert(1)</script><b>My mum</b> had breast cancer at 38`]) {
    await box.fill(text);
    await suggest.click();
    await expect(page.getByRole('status').filter({ hasText: /suggestion/ })).toBeVisible();
  }
  // Whatever was pasted is shown as text in the "from your text" quote, never run.
  await injection.check();
  await expect(page.locator('[data-person-id]')).toHaveCount(1);
});
