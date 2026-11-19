import { expect, test } from '@playwright/test';
import { createSamplePedigree } from '../../src/domain';
import { seed } from '../e2e/helpers';

// Not assertions: full-page pictures for review, saved in test-results/screenshots/
// (not committed). The showcase pictures in media/ are made separately, from the live site.
// Kept out of the test suite; `npm run screenshots` runs it.

for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
  for (const path of ['/', '/findings', '/report']) {
    test(`screenshot ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await seed(page, createSamplePedigree());
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const slug = path === '/' ? 'landing' : path.slice(1);
      const image = await page.screenshot({ path: `test-results/screenshots/${slug}-${name}.png`, fullPage: true });
      expect(image.length).toBeGreaterThan(1000);
    });
  }
}
