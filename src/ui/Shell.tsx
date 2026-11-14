import { Fragment, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { fallbackCount, getLocale, resetFallbackCount, t } from '../i18n';
import { focusPageHeading, keepFocusOnPage } from './focus';
import { StorageNotice } from './StorageNotice';
import { useLocale } from './useLocale';
import './LanguageSelect.css';

/**
 * Wraps every page. It renders again on each navigation and language change,
 * clearing the count of English fallbacks before the page renders; the note
 * after the page then knows whether that page used any.
 */
export function Shell() {
  const { pathname } = useLocation();
  const locale = useLocale();
  resetFallbackCount();

  useEffect(() => keepFocusOnPage(), []);
  // A new page moves focus to its heading, as a full page load would put it at the top.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    focusPageHeading();
  }, [pathname]);
  return (
    <>
      <StorageNotice />
      {/* Route elements never change, so React would skip them; a new key per language
          redraws the page in it. The family tree is in the store, so nothing is lost. */}
      <Fragment key={locale}>
        <Outlet />
      </Fragment>
      <FallbackNote />
    </>
  );
}

function FallbackNote() {
  // Rendered after the page in the same pass, so the count covers the whole page.
  if (getLocale() === 'en' || fallbackCount() === 0) return null;
  return (
    <p className="kt-fallback" role="note" aria-label={t('lang.fallbackLabel')}>
      {t('lang.fallback')}
    </p>
  );
}
