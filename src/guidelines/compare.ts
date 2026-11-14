import { DOMAIN_OF_CODE } from '../domain';
import type { ConditionCode, Pedigree, PersonId } from '../domain';
import { formatList, t } from '../i18n';
import type { MessageKey } from '../i18n';
import { evaluateAll, listGuidelines } from './registry';
import type {
  EvaluateOptions,
  Exclusion,
  FindingStatus,
  GuidelineDomain,
  GuidelineProfile,
} from './types';

// Side-by-side comparison of the guidelines in one domain. Everything here is
// derived from evaluateAll and the rules' own thresholds and exclusions, so the
// comparison can never disagree with the findings. No model writes any of it.

export interface ComparisonRow {
  guideline: GuidelineProfile;
  status: FindingStatus;
  /** What each rule of the guideline counts, in plain words. */
  thresholds: string[];
  /** The relatives the guideline's result rests on. */
  counted: PersonId[];
  /** Relatives with a relevant condition who were not counted, with the reason. */
  notCounted: Exclusion[];
}

export interface Comparison {
  domain: GuidelineDomain;
  rows: ComparisonRow[];
  /** How many of these guidelines count each person; people nobody counts are absent. */
  countedBy: Record<PersonId, number>;
  /** "Why they differ": sentences built from the thresholds, in reading order. */
  why: string[];
}

/** Heart when anyone in the family has a heart condition recorded, otherwise cancer. */
export function defaultDomain(ped: Pedigree): GuidelineDomain {
  const anyHeart = Object.values(ped.persons).some((person) =>
    person.conditions.some((condition) => DOMAIN_OF_CODE[condition.code] === 'cardio'),
  );
  return anyHeart ? 'cardio' : 'cancer';
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** "under 55 for men and under 60 for women", or null when the guideline has no age limit. */
function describeLimits(guideline: GuidelineProfile): string | null {
  const parts: string[] = [];
  const add = (key: MessageKey, sex: 'any' | 'male' | 'female') => {
    const ages = unique(
      guideline.rules.map((rule) => rule.thresholds.ageLimits[sex]).filter((age) => age !== undefined),
    ).sort((a, b) => a - b);
    for (const age of ages) parts.push(t(key, { age }));
  };
  add('compare.limit.any', 'any');
  add('compare.limit.male', 'male');
  add('compare.limit.female', 'female');
  return parts.length > 0 ? formatList(parts) : null;
}

function conditionsOf(guideline: GuidelineProfile): ConditionCode[] {
  return unique(guideline.rules.flatMap((rule) => rule.thresholds.conditions)).sort();
}

function describeConditions(guideline: GuidelineProfile): string {
  return formatList(
    conditionsOf(guideline).map((code) => {
      const key: MessageKey = `cond.name.${code}`;
      return t(key);
    }),
  );
}

const names = (rows: readonly ComparisonRow[]) =>
  formatList(rows.map((row) => row.guideline.shortName));

function whyTheyDiffer(rows: readonly ComparisonRow[]): string[] {
  if (rows.length < 2) return [];
  const sentences: string[] = [];
  const item = (row: ComparisonRow, detail: string) =>
    t('compare.why.item', { name: row.guideline.shortName, detail });

  const conditions = rows.map((row) => describeConditions(row.guideline));
  if (unique(conditions).length > 1) {
    sentences.push(
      t('compare.why.conditions', {
        items: rows.map((row, index) => item(row, conditions[index] ?? '')).join('; '),
      }),
    );
  }

  const limits = rows.map((row) => describeLimits(row.guideline) ?? t('compare.limit.none'));
  const [firstLimit] = limits;
  if (unique(limits).length > 1) {
    sentences.push(
      t('compare.why.ages', {
        items: rows.map((row, index) => item(row, limits[index] ?? '')).join('; '),
      }),
    );
  } else if (firstLimit !== undefined) {
    sentences.push(t('compare.why.sameAges', { limits: firstLimit }));
  }

  const countsSelf = (row: ComparisonRow) =>
    row.guideline.rules.some((rule) => rule.thresholds.countsSelf);
  const withSelf = rows.filter(countsSelf);
  const withoutSelf = rows.filter((row) => !countsSelf(row));
  if (withSelf.length > 0 && withoutSelf.length > 0) {
    sentences.push(
      t('compare.why.self', { names: names(withSelf), others: names(withoutSelf) }),
    );
  }

  // The relatives who are counted by some of the guidelines and not by others.
  const people = unique(rows.flatMap((row) => row.counted));
  let anyPersonDiffers = false;
  for (const personId of people) {
    const counting = rows.filter((row) => row.counted.includes(personId));
    const reasons = new Map<string, ComparisonRow[]>();
    for (const row of rows) {
      if (row.counted.includes(personId)) continue;
      for (const exclusion of row.notCounted) {
        if (exclusion.personId !== personId) continue;
        reasons.set(exclusion.reason, [...(reasons.get(exclusion.reason) ?? []), row]);
      }
    }
    for (const [reason, excluding] of reasons) {
      anyPersonDiffers = true;
      sentences.push(
        t('compare.why.person', { reason, others: names(excluding), names: names(counting) }),
      );
    }
  }

  if (people.length === 0) sentences.push(t('compare.why.nobody'));
  else if (!anyPersonDiffers) sentences.push(t('compare.why.samePeople'));
  return sentences;
}

export function compareGuidelines(
  ped: Pedigree,
  domain: GuidelineDomain,
  opts: EvaluateOptions = {},
): Comparison {
  const results = evaluateAll(ped, opts);
  const rows: ComparisonRow[] = [];
  for (const guideline of listGuidelines()) {
    if (guideline.domain !== domain) continue;
    const result = results.find((candidate) => candidate.guidelineId === guideline.id);
    if (!result) continue;
    const counted = result.evidence;
    const seen = new Set<string>();
    const notCounted = guideline.rules
      .flatMap((rule) => rule.explainExclusions(ped))
      .filter((exclusion) => {
        const key = `${exclusion.personId}|${exclusion.reason}`;
        if (counted.includes(exclusion.personId) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    rows.push({
      guideline,
      status: result.status,
      thresholds: unique(
        guideline.rules.map((rule) => t(rule.thresholds.key, rule.thresholds.params)),
      ),
      counted,
      notCounted,
    });
  }

  const countedBy: Record<PersonId, number> = {};
  for (const row of rows) {
    for (const personId of row.counted) countedBy[personId] = (countedBy[personId] ?? 0) + 1;
  }
  return { domain, rows, countedBy, why: whyTheyDiffer(rows) };
}
