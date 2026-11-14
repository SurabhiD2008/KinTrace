import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { ancestorsOf } from './graph';
import { LIMITS } from './types';
import type { Pedigree, Person, PersonId } from './types';

export type ValidationCode =
  | 'missing_proband'
  | 'multiple_probands'
  | 'person_id_mismatch'
  | 'unknown_person_reference'
  | 'cycle'
  | 'too_many_biological_parents'
  | 'duplicate_parent_link'
  | 'duplicate_partnership'
  | 'self_partnership'
  | 'parent_born_after_child'
  | 'parent_age_gap_too_small'
  | 'parent_age_gap_large'
  | 'onset_after_death'
  | 'onset_after_current_age'
  | 'age_invalid'
  | 'age_too_high';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  code: ValidationCode;
  personIds: PersonId[];
  message: string;
}

/**
 * Errors that mean the tree itself is broken, as opposed to a value that
 * needs correcting. Stored or imported data with any of these is refused.
 */
export const STRUCTURAL_CODES: ReadonlySet<ValidationCode> = new Set<ValidationCode>([
  'missing_proband',
  'multiple_probands',
  'person_id_mismatch',
  'unknown_person_reference',
  'cycle',
  'too_many_biological_parents',
  'duplicate_parent_link',
  'duplicate_partnership',
  'self_partnership',
]);

const MIN_PARENT_AGE_GAP = 12;
const LARGE_PARENT_AGE_GAP = 60;

function issue(
  code: ValidationCode,
  personIds: PersonId[],
  severity: Severity = 'error',
): ValidationIssue {
  const key: MessageKey = `validation.${code}`;
  return { severity, code, personIds, message: t(key) };
}

/** Years by which the parent is older than the child, when the data can tell. */
function parentAgeGap(parent: Person, child: Person): number | null {
  if (parent.birthYear !== undefined && child.birthYear !== undefined) {
    return child.birthYear - parent.birthYear;
  }
  const bothLiving = !parent.deceased && !child.deceased;
  if (bothLiving && parent.ageNow !== undefined && child.ageNow !== undefined) {
    return parent.ageNow - child.ageNow;
  }
  return null;
}

function isWholeAge(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function agesOf(person: Person): number[] {
  const ages = person.conditions.map((condition) => condition.ageAtOnset);
  return [person.ageNow, person.ageAtDeath, ...ages].filter((age) => age !== undefined);
}

/**
 * Checks a pedigree for contradictions. `referenceYear` (never read from the
 * clock here) lets a birth year stand in for a current age.
 */
export function validatePedigree(
  ped: Pedigree,
  options: { referenceYear?: number } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entries = Object.entries(ped.persons);
  const has = (id: PersonId) => Object.hasOwn(ped.persons, id);

  // Proband: exactly one person carries the proband id.
  const claimingProband = entries.filter(([, person]) => person.id === ped.probandId);
  if (!has(ped.probandId) && claimingProband.length === 0) {
    issues.push(issue('missing_proband', []));
  }
  if (claimingProband.length > 1) {
    issues.push(
      issue(
        'multiple_probands',
        claimingProband.map(([key]) => key),
      ),
    );
  }
  for (const [key, person] of entries) {
    if (person.id !== key) issues.push(issue('person_id_mismatch', [key]));
  }

  // Links must point at people who exist.
  const links = ped.parentLinks.filter((link) => {
    const missing = [link.childId, link.parentId].filter((id) => !has(id));
    if (missing.length > 0) issues.push(issue('unknown_person_reference', missing));
    return missing.length === 0;
  });
  const pairs = ped.partnerships.filter((pair) => {
    const missing = [pair.aId, pair.bId].filter((id) => !has(id));
    if (missing.length > 0) issues.push(issue('unknown_person_reference', missing));
    return missing.length === 0;
  });

  // Nobody is their own ancestor, through links of any kind.
  const parentsByChild = new Map<PersonId, PersonId[]>();
  for (const link of links) {
    parentsByChild.set(link.childId, [...(parentsByChild.get(link.childId) ?? []), link.parentId]);
  }
  const inCycle = [...parentsByChild.keys()].filter((id) => ancestorsOf(parentsByChild, id).has(id));
  if (inCycle.length > 0) issues.push(issue('cycle', inCycle.sort()));

  // Parent links: at most two biological parents, one link per child and parent.
  const biologicalCount = new Map<PersonId, number>();
  const seenLinks = new Set<string>();
  for (const link of links) {
    if (link.kind === 'biological') {
      biologicalCount.set(link.childId, (biologicalCount.get(link.childId) ?? 0) + 1);
    }
    const key = `${link.childId}>${link.parentId}`;
    if (seenLinks.has(key)) issues.push(issue('duplicate_parent_link', [link.childId, link.parentId]));
    seenLinks.add(key);
  }
  for (const [childId, count] of biologicalCount) {
    if (count > 2) issues.push(issue('too_many_biological_parents', [childId]));
  }

  // Partnerships: no self-partnership, one partnership per pair.
  const seenPairs = new Set<string>();
  for (const pair of pairs) {
    if (pair.aId === pair.bId) {
      issues.push(issue('self_partnership', [pair.aId]));
      continue;
    }
    const key = [pair.aId, pair.bId].sort().join('+');
    if (seenPairs.has(key)) issues.push(issue('duplicate_partnership', [pair.aId, pair.bId]));
    seenPairs.add(key);
  }

  // Biological parents are plausibly older than their children.
  for (const link of links) {
    const parent = ped.persons[link.parentId];
    const child = ped.persons[link.childId];
    if (link.kind !== 'biological' || !parent || !child) continue;
    const gap = parentAgeGap(parent, child);
    if (gap === null) continue;
    const ids = [link.parentId, link.childId];
    if (gap < 0) issues.push(issue('parent_born_after_child', ids));
    else if (gap < MIN_PARENT_AGE_GAP) issues.push(issue('parent_age_gap_too_small', ids));
    else if (gap > LARGE_PARENT_AGE_GAP) issues.push(issue('parent_age_gap_large', ids, 'warning'));
  }

  // Ages are whole, non-negative, at most 120, and onset is not after the age reached.
  for (const [key, person] of entries) {
    const ages = agesOf(person);
    if (ages.some((age) => !isWholeAge(age))) issues.push(issue('age_invalid', [key]));
    if (ages.some((age) => isWholeAge(age) && age > LIMITS.maxAge)) {
      issues.push(issue('age_too_high', [key]));
    }
    const derivedAge =
      !person.deceased && person.birthYear !== undefined && options.referenceYear !== undefined
        ? options.referenceYear - person.birthYear
        : undefined;
    const currentAge = person.ageNow ?? derivedAge;
    const onsets = person.conditions
      .map((condition) => condition.ageAtOnset)
      .filter((age) => age !== undefined);
    if (person.ageAtDeath !== undefined && onsets.some((age) => age > (person.ageAtDeath ?? 0))) {
      issues.push(issue('onset_after_death', [key]));
    }
    if (currentAge !== undefined && onsets.some((age) => age > currentAge)) {
      issues.push(issue('onset_after_current_age', [key]));
    }
  }

  return issues;
}
