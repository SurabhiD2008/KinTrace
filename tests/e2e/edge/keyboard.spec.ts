import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../guard';

// The whole journey with the keyboard only.

/** WebKit on macOS moves focus to links and buttons with Option+Tab, as Safari does. */
let TAB = 'Tab';

/** Presses Tab until the target has focus. */
async function tabTo(page: Page, target: Locator, max = 120) {
  const visited: string[] = [];
  for (let i = 0; i < max; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(TAB);
    visited.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'nothing';
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name}"`;
      }),
    );
  }
  // Where focus went in the last presses shows where it is trapped.
  throw new Error(`could not reach the element with Tab; last stops: ${[...new Set(visited.slice(-12))].join(' | ')}`);
}

test('Keyboard only: build a tree, add a condition, open findings, expand a card, open the report', { tag: '@cross-browser' }, async ({ page, browserName }) => {
  TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.goto('/build');
  // The first Tab from the top of the page.
  await page.keyboard.press(TAB);

  await tabTo(page, page.getByLabel('Your sex'));
  await page.keyboard.type('Female');
  await tabTo(page, page.getByRole('button', { name: 'Start with me' }));
  await page.keyboard.press('Enter');

  await tabTo(page, page.getByRole('button', { name: 'Add mother' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Not now' }));
  await page.keyboard.press('Enter');

  // Open the mother with Enter on her symbol.
  await tabTo(page, page.locator('[data-person-id="p2"]'));
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('complementary');
  await expect(drawer.getByRole('heading', { level: 2, name: 'Mother' })).toBeFocused();

  await tabTo(page, drawer.getByLabel('Add a condition'));
  await page.keyboard.type('Breast');
  await tabTo(page, drawer.getByRole('button', { name: 'Add condition' }));
  await page.keyboard.press('Enter');
  await tabTo(page, drawer.getByLabel('Age when it started'));
  await page.keyboard.type('38');
  await expect(page.locator('[data-labels-for="p2"]')).toContainText('Breast 38');

  await tabTo(page, page.getByRole('link', { name: 'See findings' }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/findings$/);
  const cg164 = page.getByRole('button', { name: /Familial breast cancer/ });
  await expect(cg164).toContainText('Meets criteria');
  await tabTo(page, cg164);
  await page.keyboard.press('Enter');
  await expect(cg164).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(cg164).toHaveAttribute('aria-expanded', 'true');

  await tabTo(page, page.getByRole('link', { name: 'Report for your doctor' }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Family health history summary' })).toBeVisible();
  // Focus is always visible: the focused element has an outline.
  await page.keyboard.press(TAB);
  const outline = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return element ? getComputedStyle(element).outlineStyle : 'none';
  });
  expect(outline).not.toBe('none');
});
