import { en } from '../../../src/i18n/en';
import { es } from '../../../src/i18n/es';
import { hi } from '../../../src/i18n/hi';
import {
  LOCALE_STORAGE_KEY,
  fallbackCount,
  formatDate,
  formatList,
  formatNumber,
  getLocale,
  resetFallbackCount,
  setLocale,
  t,
} from '../../../src/i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLocale('en'));

describe.each([
  ['es', es],
  ['hi', hi],
] as const)('%s translation', (_code, table) => {
  it('has no key that English does not have', () => {
    const extra = Object.keys(table).filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it('keeps every placeholder of the English string, and adds none', () => {
    for (const [key, text] of Object.entries(table)) {
      expect({ key, placeholders: placeholders(text) }).toEqual({ key, placeholders: placeholders(en[key as keyof typeof en]) });
    }
  });

  it('covers the main screens: navigation, landing page, report headings, banner, completeness', () => {
    for (const key of ['landing.start', 'landing.hero.sub', 'landing.ticker', 'report.title', 'report.footer', 'review.disclaimer', 'gaps.percent', 'gaps.neverHealthy', 'status.meets'] as const) {
      expect(table[key]).toBeTruthy();
    }
  });

  it('never shows a percentage figure', () => {
    for (const text of Object.values(table)) expect(text).not.toMatch(/\d\s*%/);
  });
});

describe('locale switching', () => {
  it('translates, falls back to English for missing keys, and counts the fallbacks', () => {
    setLocale('es');
    expect(getLocale()).toBe('es');
    resetFallbackCount();
    expect(t('landing.start')).toBe('Empieza tu árbol');
    expect(fallbackCount()).toBe(0);
    expect(t('quick.title')).toBe('Quick add');
    expect(fallbackCount()).toBe(1);
    setLocale('en');
    resetFallbackCount();
    t('quick.title');
    expect(fallbackCount()).toBe(0);
  });

  it('keeps placeholders working in a translation', () => {
    setLocale('hi');
    expect(t('gaps.percent', { percent: 83 })).toBe('डेटा पूर्णता 83%');
  });

  it('remembers the choice on this device and sets the page language', () => {
    setLocale('hi');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
    setLocale('en');
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('ignores a language it does not have', () => {
    setLocale('fr' as 'en');
    expect(getLocale()).toBe('en');
  });

  it('formats dates, numbers and lists with Intl in the chosen language', () => {
    expect(formatDate('2026-11-11')).toBe('11 November 2026');
    expect(formatList(['a', 'b', 'c'])).toBe('a, b and c');
    setLocale('es');
    expect(formatDate('2026-11-11')).toBe('11 de noviembre de 2026');
    expect(formatList(['a', 'b', 'c'])).toBe('a, b y c');
    expect(formatNumber(1234)).toMatch(/^1\.?234$/);
  });
});
