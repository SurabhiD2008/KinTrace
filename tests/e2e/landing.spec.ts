import { expect, test } from './guard';
import { seriousViolations } from './helpers';

test('landing: hero, the sample family button, and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your family history is your cheapest genetic test.');
  await expect(page.locator('.kt-hero__mark')).toHaveText('cheapest genetic test');
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Try the sample family' }).click();
  await expect(page).toHaveURL(/\/findings$/);
  await expect(page.getByRole('button', { name: /Familial breast cancer/ })).toContainText('Meets criteria');
  expect(errors).toEqual([]);
});

for (const width of [360, 768, 1440]) {
  test(`no horizontal scrollbar at ${width}px on the landing, method and report pages`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/method', '/report']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect({ path, overflow }).toEqual({ path, overflow: 0 });
    }
  });
}

test('the method page passes the accessibility check', async ({ page }) => {
  await page.goto('/method');
  await expect(page.getByRole('heading', { level: 1, name: 'Method and sources' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('the ticker stands still for people who ask for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.locator('.kt-ticker__track').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('FAQ answers open from the keyboard', async ({ page }) => {
  await page.goto('/');
  const summary = page.locator('summary', { hasText: 'Is this a diagnosis?' });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details', { has: summary })).toHaveAttribute('open', '');
});
