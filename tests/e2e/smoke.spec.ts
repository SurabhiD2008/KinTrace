import { expect, test } from './guard';

test('home page renders with the design tokens applied and a clean console', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'KinTrace' }).first()).toBeVisible();
  // The live comparison band shows the status colours from the tokens.
  await expect(page.locator('.kt-band [data-status="discuss"]').first()).toHaveCSS('background-color', 'rgb(255, 216, 74)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(238, 242, 236)');
  expect(errors).toEqual([]);
});

test('an unknown address shows the not-found page and links home', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the start' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your family history is your cheapest genetic test.');
});
