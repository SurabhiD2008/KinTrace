import type { Page } from '@playwright/test';
import { serialize } from '../../../src/domain';
import type { Pedigree } from '../../../src/domain';
import { buildPedigree } from '../../fixtures/pedigrees';
import type { PedigreeSpec } from '../../fixtures/pedigrees';

export const STORAGE_KEY = 'kintrace.pedigree.v1';
export const ROUTES = ['/', '/build', '/findings', '/compare', '/report', '/method'] as const;

/** Puts raw text in storage before every load of the page, as a browser holding old or broken data would. */
export async function seedRaw(page: Page, value: string): Promise<void> {
  await page.addInitScript(
    ([key, text]) => {
      if (!sessionStorage.getItem('kt-seeded')) {
        window.localStorage.setItem(key, text);
        sessionStorage.setItem('kt-seeded', '1');
      }
    },
    [STORAGE_KEY, value] as const,
  );
}

/** Stores a family once (not on every reload), so reload tests see what the app saved. */
export async function seedOnce(page: Page, ped: Pedigree): Promise<void> {
  await seedRaw(page, serialize(ped));
}

export const family = (spec: PedigreeSpec): Pedigree => buildPedigree(spec);

/** What the app has saved right now. */
export async function stored(page: Page): Promise<Pedigree | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return text === null ? null : (JSON.parse(text) as Pedigree);
}

/** No sideways scrolling: the page is never wider than the window. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
