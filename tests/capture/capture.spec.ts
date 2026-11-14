import { expect, test } from '@playwright/test';
import { createSamplePedigree } from '../../src/domain';
import { seed } from '../e2e/helpers';

// Not assertions: pictures for review and for the submission. They overwrite files in
// media, so they are not part of the test suite (which would leave the working
// tree changed after every run); `npm run screenshots` refreshes them.

for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
  for (const path of ['/', '/findings', '/report']) {
    test(`screenshot ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await seed(page, createSamplePedigree());
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const slug = path === '/' ? 'landing' : path.slice(1);
      const image = await page.screenshot({ path: `media/${slug}-${name}.png`, fullPage: true });
      expect(image.length).toBeGreaterThan(1000);
    });
  }
}
