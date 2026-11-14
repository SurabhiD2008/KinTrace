import { useId } from 'react';
import { LOCALES, setLocale, t } from '../i18n';
import type { Locale, MessageKey } from '../i18n';
import { useLocale } from './useLocale';
import './LanguageSelect.css';

const NAME: Record<Locale, MessageKey> = { en: 'lang.en', es: 'lang.es', hi: 'lang.hi' };

/** Switches the language for the whole app. The choice is remembered on this device. */
export function LanguageSelect() {
  const id = useId();
  const locale = useLocale();
  return (
    <div className="kt-lang">
      <label htmlFor={id} className="visually-hidden">
        {t('lang.label')}
      </label>
      <select id={id} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        {LOCALES.map((code) => (
          // Each language is named in itself, so it can be found by someone who reads only that one.
          <option key={code} value={code} lang={code}>
            {t(NAME[code])}
          </option>
        ))}
      </select>
    </div>
  );
}
