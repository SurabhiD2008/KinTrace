import { Link } from 'react-router-dom';
import { createSamplePedigree } from '../domain';
import { evaluateAll, getGuideline, listGuidelines } from '../guidelines';
import { formatDate, formatNumber, t } from '../i18n';
import type { MessageKey } from '../i18n';
import { Card, ROUTES, Sticker } from '../ui';
import { LanguageSelect } from '../ui/LanguageSelect';
import { capitalise, personName } from '../ui/pedigree/describe';
import { recordedCounts } from './method/counts';
import { STATUS_KEY } from './report/model';
import './review/review.css';
import './method/method.css';

const VERSION_KEY: Record<string, MessageKey> = {
  'nice-cg164': 'g.cg164.version',
  'amsterdam-ii': 'g.amsterdam.version',
  'nice-cg71': 'g.cg71.version',
  'dlcn-family-history': 'g.dlcn.version',
  'nice-ng238': 'g.ng238.version',
};

/**
 * Sources and method, for reviewers. Every guideline, criterion and golden
 * result here is read from the code at run time, so it cannot drift from it.
 */
export function MethodPage() {
  const guidelines = listGuidelines();
  // A few milliseconds of work on a page that rarely re-renders: no memo needed.
  const sample = createSamplePedigree();
  const golden = evaluateAll(sample);
  const counts = recordedCounts();

  return (
    <main className="page kt-method">
      <header className="kt-review__titlebar">
        <h1>{t('method.title')}</h1>
        <nav aria-label={t('review.nav')} className="row">
          <Link to={ROUTES.home} className="link-target">{t('notFound.home')}</Link>
          <Link to={ROUTES.build} className="link-target">{t('build.title')}</Link>
          <LanguageSelect />
        </nav>
      </header>
      <p>{t('method.intro')}</p>

      <section aria-labelledby="method-guidelines" className="stack">
        <h2 id="method-guidelines">{t('method.guidelines')}</h2>
        {guidelines.map((guideline) => {
          const versionKey = VERSION_KEY[guideline.id];
          return (
            <Card key={guideline.id} title={guideline.name} headingLevel={3}>
              <dl className="kt-method__facts">
                <dt>{t('method.publisher')}</dt>
                <dd>{guideline.publisher}</dd>
                <dt>{t('method.scope')}</dt>
                <dd>{guideline.countryOrScope}</dd>
                {versionKey ? (
                  <>
                    <dt>{t('method.edition')}</dt>
                    <dd>{t(versionKey)}</dd>
                  </>
                ) : null}
                <dt>{t('method.reviewed')}</dt>
                <dd>
                  <time dateTime={guideline.lastReviewed}>{formatDate(guideline.lastReviewed)}</time>
                </dd>
                <dt>{t('method.source')}</dt>
                <dd>
                  <a className="kt-method__source" href={guideline.sourceUrl} target="_blank" rel="noreferrer noopener">
                    {guideline.sourceTitle}
                  </a>
                </dd>
              </dl>
              <h4>{t('method.criteria')}</h4>
              <ul className="kt-method__rules">
                {guideline.rules.map((rule) => (
                  <li key={rule.id} data-rule={rule.id}>
                    <p className="kt-method__rule">{capitalise(rule.title)}</p>
                    <p className="muted">
                      {t('method.counts')}: {t(rule.thresholds.key, rule.thresholds.params)}.{' '}
                      {t(rule.outcomeWhenMet === 'meets' ? 'method.outcome.meets' : 'method.outcome.discuss')}.
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </section>

      <section aria-labelledby="method-not" className="kt-method__section">
        <h2 id="method-not">{t('method.notDo')}</h2>
        <ul>
          <li>{t('method.notDo.risk')}</li>
          <li>{t('method.notDo.diagnosis')}</li>
          <li>{t('method.notDo.model')}</li>
        </ul>
      </section>

      <section aria-labelledby="method-unknown" className="kt-method__section">
        <h2 id="method-unknown">{t('method.unknown')}</h2>
        <p>{t('method.unknown.body1')}</p>
        <p>{t('method.unknown.body2')}</p>
      </section>

      <section aria-labelledby="method-validation" className="kt-method__section">
        <h2 id="method-validation">{t('method.validation')}</h2>
        <p>
          {counts
            ? t('method.validation.counts', {
                counts: t('method.validation.countsText', { unit: formatNumber(counts.unit), e2e: formatNumber(counts.e2e) }),
              })
            : t('method.validation.countsMissing')}
        </p>
        <p>{t('method.validation.golden')}</p>
        <div className="kt-table-wrap" role="region" aria-label={t('method.validation.goldenCaption')} tabIndex={0}>
          <table className="kt-compare">
            <caption>{t('method.validation.goldenCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('compare.col.guideline')}</th>
                <th scope="col">{t('compare.col.result')}</th>
                <th scope="col">{t('compare.col.counted')}</th>
              </tr>
            </thead>
            <tbody>
              {golden.map((result) => (
                <tr key={result.guidelineId} data-guideline={result.guidelineId}>
                  <th scope="row">{getGuideline(result.guidelineId)?.shortName}</th>
                  <td>
                    <Sticker status={result.status}>{t(STATUS_KEY[result.status])}</Sticker>
                  </td>
                  <td>{result.evidence.length === 0 ? t('compare.nobody') : result.evidence.map((id) => personName(sample, id)).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t('method.validation.more')}</p>
      </section>
    </main>
  );
}
