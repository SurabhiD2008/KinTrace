import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale } from '../i18n';
import type { Locale } from '../i18n';

/** The current language; components using it render again when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}
