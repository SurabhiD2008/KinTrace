import type { Finding, FindingStatus, GuidelineDomain, GuidelineProfile, GuidelineResult } from '../../guidelines';

// Ordering and filtering for the findings page. Pure, so it is tested on its own.

export const FILTERS = ['all', 'cancer', 'heart'] as const;
export type Filter = (typeof FILTERS)[number];
export const FILTER_PARAM = 'show';
export const DOMAIN_PARAM = 'domain';

const DOMAIN_OF_FILTER: Record<Exclude<Filter, 'all'>, GuidelineDomain> = {
  cancer: 'cancer',
  heart: 'cardio',
};

/** Reads the filter from the address; anything unrecognised means "all". */
export function parseFilter(value: string | null): Filter {
  return FILTERS.find((filter) => filter === value) ?? 'all';
}

export function inFilter(filter: Filter, domain: GuidelineDomain): boolean {
  return filter === 'all' || DOMAIN_OF_FILTER[filter] === domain;
}

/** The domain switcher on the comparison page uses the same words as the filter chips. */
export function parseDomain(value: string | null): GuidelineDomain | null {
  if (value === 'heart') return 'cardio';
  if (value === 'cancer') return 'cancer';
  return null;
}

export function domainParam(domain: GuidelineDomain): 'heart' | 'cancer' {
  return domain === 'cardio' ? 'heart' : 'cancer';
}

export const STRENGTH: Record<FindingStatus, number> = { none: 0, discuss: 1, meets: 2 };
const DOMAIN_ORDER: Record<GuidelineDomain, number> = { cancer: 0, cardio: 1 };

export interface Entry {
  guideline: GuidelineProfile;
  result: GuidelineResult;
}

/** Strongest status first, then cancer before heart, then the registry's own order. */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        STRENGTH[b.entry.result.status] - STRENGTH[a.entry.result.status] ||
        DOMAIN_ORDER[a.entry.guideline.domain] - DOMAIN_ORDER[b.entry.guideline.domain] ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
}

/**
 * The finding a card leads with: the first rule that carries the guideline's
 * status, or, when nothing is met, the rule that got furthest.
 */
export function primaryFinding(result: GuidelineResult): Finding | undefined {
  if (result.status !== 'none') {
    return result.findings.find((finding) => finding.status === result.status);
  }
  const passed = (finding: Finding) => finding.steps.filter((step) => step.result === 'passed').length;
  return result.findings.reduce<Finding | undefined>(
    (best, finding) => (best === undefined || passed(finding) > passed(best) ? finding : best),
    undefined,
  );
}
