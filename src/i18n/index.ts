import { en } from './en';
import type { MessageKey } from './en';
import { es } from './es';
import { hi } from './hi';

export type { MessageKey };

// Every user-facing string goes through t(). English is complete; Spanish and
// Hindi cover the main screens, and any key they lack falls back to English.
// The language is a display choice only: it is not family data.

export const LOCALES = ['en', 'es', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

/** A translation may leave keys out; it may never add one that English does not have. */
export type Translation = Partial<Record<MessageKey, string>>;

const TABLES: Record<Locale, Translation> = { en, es, hi };
/** BCP 47 tags for Intl and the html lang attribute. */
export const LOCALE_TAGS: Record<Locale, string> = { en: 'en-GB', es: 'es', hi: 'hi' };
export const LOCALE_STORAGE_KEY = 'kintrace.locale.v1';

const isLocale = (value: unknown): value is Locale => LOCALES.some((locale) => locale === value);

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStored(): Locale {
  try {
    const stored = storage()?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
}

let current: Locale = readStored();
const listeners = new Set<() => void>();
let fallbackHits = 0;

function applyToDocument(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALE_TAGS[locale];
}
applyToDocument(current);

export function getLocale(): Locale {
  return current;
}

/** Changes the language everywhere, remembers it on this device, and sets the page's lang attribute. */
export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  try {
    storage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  applyToDocument(locale);
  listeners.forEach((listener) => listener());
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Counts English fallbacks since the last reset, so a page can say some text is in English. */
export function resetFallbackCount(): void {
  fallbackHits = 0;
}
export function fallbackCount(): number {
  return fallbackHits;
}

export function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * Returns the user-facing string for a key in the current language, or the
 * English one when the translation lacks it. `{name}` tokens are replaced
 * from `params`.
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  let template = TABLES[current][key];
  if (template === undefined) {
    template = en[key];
    if (current !== 'en') fallbackHits += 1;
  }
  return interpolate(template, params);
}

/** Joins items the way a sentence would in the current language: "a, b and c". */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(LOCALE_TAGS[current], { style: 'long', type: 'conjunction' }).format(items);
}

/**
 * A whole date in the current language: "12 November 2026". An ISO date string
 * is a calendar day and reads the same everywhere; a Date is a moment, shown as
 * the day it is on the user's own clock (the same day the page's year comes from).
 */
export function formatDate(value: string | Date): string {
  if (typeof value === 'string') {
    const day = new Date(`${value.slice(0, 10)}T12:00:00Z`);
    return new Intl.DateTimeFormat(LOCALE_TAGS[current], { dateStyle: 'long', timeZone: 'UTC' }).format(day);
  }
  return new Intl.DateTimeFormat(LOCALE_TAGS[current], { dateStyle: 'long' }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE_TAGS[current]).format(value);
}
