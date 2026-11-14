import { Link } from 'react-router-dom';
import { completeness } from '../../domain';
import type { Pedigree } from '../../domain';
import { t } from '../../i18n';
import { ROUTES } from '../../ui';
import { LanguageSelect } from '../../ui/LanguageSelect';
import { Disclaimer } from './Disclaimer';

export interface ReviewHeaderProps {
  title: string;
  /** Shown when there is a family to summarise. */
  pedigree: Pedigree | null;
  referenceYear: number;
  current: 'findings' | 'compare' | 'report';
}

export function ReviewHeader({ title, pedigree, referenceYear, current }: ReviewHeaderProps) {
  const relatives = pedigree ? Object.keys(pedigree.persons).length - 1 : 0;
  return (
    <header className="kt-review__header">
      <div className="kt-review__titlebar">
        <h1>{title}</h1>
        <nav aria-label={t('review.nav')} className="row">
          <Link className="link-target" to={ROUTES.build}>
            {t('review.toBuilder')}
          </Link>
          <Link
            className="link-target"
            to={ROUTES.findings}
            aria-current={current === 'findings' ? 'page' : undefined}
          >
            {t('review.toFindings')}
          </Link>
          <Link
            className="link-target"
            to={ROUTES.compare}
            aria-current={current === 'compare' ? 'page' : undefined}
          >
            {t('review.toCompare')}
          </Link>
          <Link
            className="link-target"
            to={ROUTES.report}
            aria-current={current === 'report' ? 'page' : undefined}
          >
            {t('report.pageTitle')}
          </Link>
          <LanguageSelect />
        </nav>
      </div>
      {pedigree ? (
        <p className="kt-review__summary">
          <span>
            {relatives === 1
              ? t('review.family.one')
              : t('review.family.many', { count: relatives })}
          </span>{' '}
          {/* The completeness figure is part of the completeness measure, the one place a percent appears. */}
          <a href="#completeness" data-completeness>
            {t('gaps.percent', { percent: completeness(pedigree, { referenceYear }).percent })}
          </a>
        </p>
      ) : null}
      <Disclaimer />
    </header>
  );
}
