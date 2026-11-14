import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PersonId } from '../domain';
import { compareGuidelines, defaultDomain } from '../guidelines';
import type { GuidelineDomain } from '../guidelines';
import { t } from '../i18n';
import { usePedigreeStore } from '../state/store';
import { Sticker } from '../ui';
import { personName } from '../ui/pedigree/describe';
import { DOMAIN_PARAM, domainParam, parseDomain } from './review/order';
import { ReviewGate } from './review/ReviewGate';
import { ReviewHeader } from './review/ReviewHeader';
import { ReviewTree } from './review/ReviewTree';
import type { ShowRequest } from './review/ReviewTree';
import './review/review.css';

const DOMAINS: readonly GuidelineDomain[] = ['cardio', 'cancer'];
const DOMAIN_LABEL = { cardio: 'findings.filter.heart', cancer: 'findings.filter.cancer' } as const;
const CAPTION = { cardio: 'compare.caption.cardio', cancer: 'compare.caption.cancer' } as const;
const STATUS_LABEL = { meets: 'status.meets', discuss: 'status.discuss', none: 'status.none' } as const;

export function ComparePage() {
  const pedigree = usePedigreeStore((state) => state.pedigree);
  const started = usePedigreeStore((state) => state.started);
  const referenceYear = useMemo(() => new Date().getFullYear(), []);
  const [params, setParams] = useSearchParams();
  const domain = parseDomain(params.get(DOMAIN_PARAM)) ?? defaultDomain(pedigree);
  const comparison = useMemo(
    () => compareGuidelines(pedigree, domain, { referenceYear }),
    [pedigree, domain, referenceYear],
  );
  const [show, setShow] = useState<ShowRequest | null>(null);

  const chooseDomain = (next: GuidelineDomain) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set(DOMAIN_PARAM, domainParam(next));
    setParams(nextParams);
  };
  const showPerson = (id: PersonId, from: HTMLElement) =>
    setShow((current) => ({ id, token: (current?.token ?? 0) + 1, returnTo: from }));
  const person = (id: PersonId) => (
    <button
      type="button"
      className="kt-chip"
      aria-label={t('findings.showPerson', { name: personName(pedigree, id) })}
      onClick={(event) => showPerson(id, event.currentTarget)}
    >
      {personName(pedigree, id)}
    </button>
  );

  return (
    <main className="page kt-review">
      <ReviewHeader
        title={t('compare.title')}
        pedigree={started ? pedigree : null}
        referenceYear={referenceYear}
        current="compare"
      />
      <ReviewGate started={started} pedigree={pedigree} referenceYear={referenceYear}>
        <div className="kt-review__layout kt-review__layout--wide">
          <div className="kt-review__main">
            <p>{t('compare.intro')}</p>
            <div className="kt-filters" role="group" aria-label={t('compare.domain')}>
              {DOMAINS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="kt-chip kt-chip--filter"
                  aria-pressed={domain === option}
                  onClick={() => chooseDomain(option)}
                >
                  {t(DOMAIN_LABEL[option])}
                </button>
              ))}
            </div>

            {/* Focusable so the table can be scrolled sideways with the keyboard on small screens. */}
            <div className="kt-table-wrap" role="region" aria-label={t('compare.tableLabel')} tabIndex={0}>
              <table className="kt-compare">
                <caption>{t(CAPTION[domain])}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('compare.col.guideline')}</th>
                    <th scope="col">{t('compare.col.result')}</th>
                    <th scope="col">{t('compare.col.threshold')}</th>
                    <th scope="col">{t('compare.col.counted')}</th>
                    <th scope="col">{t('compare.col.notCounted')}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.guideline.id} data-guideline={row.guideline.id}>
                      <th scope="row">{row.guideline.shortName}</th>
                      <td data-cell="result">
                        <Sticker status={row.status}>{t(STATUS_LABEL[row.status])}</Sticker>
                      </td>
                      <td data-cell="threshold">
                        <ul className="kt-compare__list">
                          {row.thresholds.map((text) => (
                            <li key={text}>{text}</li>
                          ))}
                        </ul>
                      </td>
                      <td data-cell="counted">
                        {row.counted.length === 0 ? (
                          t('compare.nobody')
                        ) : (
                          <ul className="kt-chips">
                            {row.counted.map((id) => (
                              <li key={id}>{person(id)}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td data-cell="not-counted">
                        {row.notCounted.length === 0 ? (
                          t('compare.nobody')
                        ) : (
                          <ul className="kt-compare__list">
                            {row.notCounted.map((exclusion) => (
                              <li key={`${exclusion.personId}|${exclusion.reason}`}>{exclusion.reason}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="kt-card" aria-labelledby="why-differ">
              <h2 id="why-differ">{t('compare.why.title')}</h2>
              <p data-why>{comparison.why.join(' ')}</p>
            </section>
          </div>
          <ReviewTree
            pedigree={pedigree}
            referenceYear={referenceYear}
            highlightIds={Object.keys(comparison.countedBy)}
            counts={comparison.countedBy}
            show={show}
          />
        </div>
      </ReviewGate>
    </main>
  );
}
