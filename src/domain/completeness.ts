import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { parentIdsOf } from './graph';
import { ageOf, relativesOf } from './relationships';
import type { Pedigree, Person, PersonId } from './types';

// This measures how complete the family information is. It is a data-quality
// measure only: it says nothing about anyone's health or risk.

export type GapField =
  | 'biologicalParent'
  | 'sex'
  | 'vitalStatus'
  | 'age'
  | 'conditionOnset'
  // The next two are reported by the guideline rules, not by completeness().
  | 'conditionConfirmation'
  | 'conditionLaterality'
  | 'healthHistory'
  | 'biologicalFamily';

export interface Gap {
  personId: PersonId;
  field: GapField;
  /** 3 for the proband and first-degree relatives, 2 for second degree, 1 for third. */
  weight: number;
  text: string;
}

export interface DataCompleteness {
  /** 0 to 100: share of the weighted information checks that are answered. */
  percent: number;
  gaps: Gap[];
}

const WEIGHT_BY_DEGREE = { 1: 3, 2: 2, 3: 1 } as const;
const PROBAND_WEIGHT = 3;
/** Someone adopted into the family is not a blood relative, so counts least. */
const ADOPTED_IN_WEIGHT = 1;

/**
 * Lists what is not known about the proband's family and how much of the
 * expected information is present. Unknown is reported, never assumed healthy.
 */
export function completeness(
  ped: Pedigree,
  options: { referenceYear?: number } = {},
): DataCompleteness {
  const proband = ped.persons[ped.probandId];
  if (!proband) return { percent: 0, gaps: [] };

  const gaps: Gap[] = [];
  let total = 0;
  const check = (
    known: boolean,
    personId: PersonId,
    field: GapField,
    weight: number,
    name: string,
  ) => {
    total += weight;
    if (known) return;
    const key: MessageKey = `gap.${field}`;
    gaps.push({ personId, field, weight, text: t(key, { name }) });
  };
  const checkPerson = (person: Person, weight: number, name: string, isProband: boolean) => {
    check(person.sex !== 'unknown', person.id, 'sex', weight, name);
    check(ageOf(person, options.referenceYear) !== null, person.id, 'age', weight, name);
    if (!isProband) {
      check(person.vitalStatusUnknown !== true, person.id, 'vitalStatus', weight, name);
      check(person.healthHistoryUnknown !== true, person.id, 'healthHistory', weight, name);
    }
    for (const condition of person.conditions) {
      check(condition.ageAtOnset !== undefined, person.id, 'conditionOnset', weight, name);
    }
  };

  const you = t('person.you');
  // Two biological parents are expected; each one not recorded is a gap.
  const recordedParents = parentIdsOf(ped, ped.probandId, 'biological').length;
  for (let slot = 0; slot < 2; slot += 1) {
    check(slot < recordedParents, ped.probandId, 'biologicalParent', PROBAND_WEIGHT, you);
  }
  checkPerson(proband, PROBAND_WEIGHT, you, true);

  for (const { personId, relationship } of relativesOf(ped, ped.probandId, 3)) {
    const person = ped.persons[personId];
    if (!person || relationship.degree === null) continue;
    const name = person.displayName ?? t('person.the', { label: relationship.label });
    checkPerson(person, WEIGHT_BY_DEGREE[relationship.degree], name, false);
  }

  // People adopted into the family: is anything recorded about their biological family?
  for (const person of Object.values(ped.persons)) {
    if (person.id === ped.probandId) continue;
    const adopted = parentIdsOf(ped, person.id, 'adoptive').length > 0;
    if (!adopted) continue;
    const hasBiological = parentIdsOf(ped, person.id, 'biological').length > 0;
    const name = person.displayName ?? t('person.unnamed');
    check(hasBiological, person.id, 'biologicalFamily', ADOPTED_IN_WEIGHT, name);
  }

  const missing = gaps.reduce((sum, gap) => sum + gap.weight, 0);
  const rounded = Math.round(100 * (1 - missing / total));
  // Never round up to "complete" while a gap remains.
  const percent = gaps.length > 0 ? Math.min(rounded, 99) : 100;
  return { percent, gaps };
}
