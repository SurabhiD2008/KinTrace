import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PersonId } from '../domain';
import { evaluateAll, getGuideline } from '../guidelines';
import { t } from '../i18n';
import { usePedigreeStore } from '../state/store';
import { CompletenessPanel } from '../ui';
import { FindingCard } from './review/FindingCard';
import { FILTERS, FILTER_PARAM, inFilter, parseFilter, sortEntries } from './review/order';
import type { Entry, Filter } from './review/order';
import { ReviewGate } from './review/ReviewGate';
import { ReviewHeader } from './review/ReviewHeader';
import { ReviewTree } from './review/ReviewTree';
import type { ShowRequest } from './review/ReviewTree';
import './review/review.css';

const FILTER_LABEL = {
  all: 'findings.filter.all',
  cancer: 'findings.filter.cancer',
  heart: 'findings.filter.heart',
} as const;

export function FindingsPage() {
  const pedigree = usePedigreeStore((state) => state.pedigree);
  const started = usePedigreeStore((state) => state.started);
  // The page may read the clock; the rules never do.
  const referenceYear = useMemo(() => new Date().getFullYear(), []);
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get(FILTER_PARAM));

  const entries = useMemo<Entry[]>(
    () =>
      sortEntries(
        evaluateAll(pedigree, { referenceYear }).flatMap((result) => {
          const guideline = getGuideline(result.guidelineId);
          return guideline ? [{ guideline, result }] : [];
        }),
      ),
    [pedigree, referenceYear],
  );

  // Open cards, most recently opened last; that one is shown on the tree.
  const [open, setOpen] = useState<string[]>(() => {
    const strongest = entries[0];
    return strongest ? [strongest.guideline.id] : [];
  });
  const [show, setShow] = useState<ShowRequest | null>(null);

  const visible = entries.filter((entry) => inFilter(filter, entry.guideline.domain));
  const activeId = [...open].reverse().find((id) => visible.some((e) => e.guideline.id === id));
  const active = visible.find((entry) => entry.guideline.id === activeId);
  const highlight = active?.result.evidence ?? [];

  const toggle = (id: string) =>
    setOpen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const chooseFilter = (next: Filter) => {
    const nextParams = new URLSearchParams(params);
    if (next === 'all') nextParams.delete(FILTER_PARAM);
    else nextParams.set(FILTER_PARAM, next);
    setParams(nextParams);
  };
  const showPerson = (id: PersonId, from: HTMLElement) =>
    setShow((current) => ({ id, token: (current?.token ?? 0) + 1, returnTo: from }));

  return (
    <main className="page kt-review">
      <ReviewHeader
        title={t('findings.title')}
        pedigree={started ? pedigree : null}
        referenceYear={referenceYear}
        current="findings"
      />
      <ReviewGate started={started} pedigree={pedigree} referenceYear={referenceYear}>
        <div className="kt-review__layout">
          <div className="kt-review__main">
            <div className="kt-filters" role="group" aria-label={t('findings.filter')}>
              {FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="kt-chip kt-chip--filter"
                  aria-pressed={filter === option}
                  onClick={() => chooseFilter(option)}
                >
                  {t(FILTER_LABEL[option])}
                </button>
              ))}
            </div>
            <div className="kt-review__cards" aria-label={t('findings.cards')} role="region">
              {visible.map(({ guideline, result }) => (
                <FindingCard
                  key={guideline.id}
                  guideline={guideline}
                  result={result}
                  pedigree={pedigree}
                  expanded={open.includes(guideline.id)}
                  onToggle={() => toggle(guideline.id)}
                  onShowPerson={showPerson}
                />
              ))}
            </div>
            <div id="completeness">
              <CompletenessPanel pedigree={pedigree} referenceYear={referenceYear} />
            </div>
          </div>
          <ReviewTree
            pedigree={pedigree}
            referenceYear={referenceYear}
            highlightIds={highlight}
            dimOthers={highlight.length > 0}
            show={show}
          />
        </div>
      </ReviewGate>
    </main>
  );
}
