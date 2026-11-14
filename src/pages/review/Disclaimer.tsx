import { t } from '../../i18n';

/** The permanent banner. It has no close control on purpose: it cannot be dismissed. */
export function Disclaimer() {
  return (
    <aside className="kt-disclaimer" aria-label={t('review.disclaimerLabel')} data-disclaimer>
      <p>{t('review.disclaimer')}</p>
    </aside>
  );
}
