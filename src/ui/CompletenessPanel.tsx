import { useId } from 'react';
import { Link } from 'react-router-dom';
import { completeness } from '../domain';
import type { Pedigree } from '../domain';
import { t } from '../i18n';
import { Card } from './Card';
import { buildLink } from './routes';
import './CompletenessPanel.css';

export interface CompletenessPanelProps {
  pedigree: Pedigree;
  referenceYear: number;
  /** How many of the biggest gaps to list. */
  limit?: number;
  headingLevel?: 2 | 3;
}

/**
 * "What we don't know": how complete the family information is, and the
 * biggest gaps, each with a link that opens the builder at the missing field.
 * This is a measure of the data only; it says nothing about anyone's health.
 */
export function CompletenessPanel({
  pedigree,
  referenceYear,
  limit = 5,
  headingLevel = 2,
}: CompletenessPanelProps) {
  const labelId = useId();
  const { percent, gaps } = completeness(pedigree, { referenceYear });
  // Heaviest first; equal weights keep their order (closest relatives were checked first).
  const top = [...gaps].sort((a, b) => b.weight - a.weight).slice(0, limit);
  const rest = gaps.length - top.length;

  return (
    <Card title={t('gaps.title')} headingLevel={headingLevel}>
      {/* The only place in the app where a percent sign appears. */}
      <div className="kt-meter" data-completeness>
        <p id={labelId} className="kt-meter__label">
          {t('gaps.percent', { percent })}
        </p>
        <svg
          className="kt-meter__bar"
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
        >
          <rect className="kt-meter__track" width="100" height="10" />
          <rect className="kt-meter__fill" width={percent} height="10" />
        </svg>
      </div>
      <p className="muted">
        {t('gaps.explain')} {t('gaps.neverHealthy')}
      </p>
      {top.length === 0 ? (
        <p>{t('gaps.none')}</p>
      ) : (
        <ul className="kt-gaps">
          {top.map((gap, index) => (
            <li key={`${gap.personId}-${gap.field}-${index}`} className="kt-gaps__gap">
              <span>{gap.text}</span>
              <Link
                className="kt-gaps__fix link-target"
                to={buildLink(gap.personId, gap.field)}
                aria-label={t('gaps.fixLabel', { gap: gap.text })}
              >
                {t('gaps.fix')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? <p className="muted">{t('gaps.more', { count: rest })}</p> : null}
    </Card>
  );
}
