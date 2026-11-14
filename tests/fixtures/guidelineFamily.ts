import { evaluateAll, getGuideline } from '../../src/guidelines';
import type { Finding, FindingStatus } from '../../src/guidelines';
import type { Condition, ConditionCode, Confirmation, Laterality, Pedigree, Person } from '../../src/domain';
import { DOMAIN_OF_CODE } from '../../src/domain';
import { buildPedigree } from './pedigrees';

/**
 * A fixed family around "me" in which nobody has any condition. Tests give
 * conditions to the people they need.
 *
 * First degree: mom, dad, sis, bro, sibx (sex unknown), sibi (intersex),
 * outsib (adopted out, biological links kept), dau, son.
 * Second degree: hsis (half-sister through mom), mgm, mgf, pgm, pgf, maunt,
 * muncle, paunt, puncle.
 * Third degree: mhaunt (half-aunt through mgm), cousin (maunt's daughter).
 * Not blood relatives: stepmom, asib (adopted in), partner, hsdad, ap1, ap2.
 */
const SKELETON = {
  people:
    'me:f mom:f dad:m sis:f bro:m sibx:u sibi:i outsib:f dau:f son:m partner:m hsis:f hsdad:m ' +
    'mgm:f mgf:m pgm:f pgf:m maunt:f muncle:m paunt:f puncle:m mhaunt:f cousin:f ' +
    'stepmom:f asib:f ap1:f ap2:m',
  bio:
    'me<mom+dad sis<mom+dad bro<mom+dad sibx<mom+dad sibi<mom+dad outsib<mom+dad ' +
    'dau<me+partner son<me+partner hsis<mom+hsdad mom<mgm+mgf dad<pgm+pgf maunt<mgm+mgf ' +
    'muncle<mgm+mgf paunt<pgm+pgf puncle<pgm+pgf mhaunt<mgm cousin<maunt',
  step: 'me<stepmom',
  adoptive: 'asib<mom+dad outsib<ap1+ap2',
  partners: 'me+partner mom+dad',
};

export type ConditionSpec = [
  code: ConditionCode,
  ageAtOnset?: number | null,
  extra?: { confirmed?: Confirmation; laterality?: Laterality; subtype?: string },
];

function toCondition([code, age, extra]: ConditionSpec, index: number): Condition {
  return {
    id: `c${index + 1}`,
    code,
    domain: DOMAIN_OF_CODE[code],
    ageUnknown: false,
    confirmed: extra?.confirmed ?? 'confirmed',
    ...(typeof age === 'number' && { ageAtOnset: age }),
    ...(extra?.laterality !== undefined && { laterality: extra.laterality }),
    ...(extra?.subtype !== undefined && { subtype: extra.subtype }),
  };
}

export type Affected = Record<string, ConditionSpec[]>;

/** The fixed family with the given conditions; `details` adds other person fields. */
export function family(
  affected: Affected = {},
  details: Record<string, Partial<Omit<Person, 'id' | 'conditions'>>> = {},
): Pedigree {
  const ids = new Set([...Object.keys(affected), ...Object.keys(details)]);
  return buildPedigree({
    ...SKELETON,
    details: Object.fromEntries(
      [...ids].map((id) => [
        id,
        { ...details[id], conditions: (affected[id] ?? []).map(toCondition) },
      ]),
    ),
  });
}

export function findingFor(ped: Pedigree, ruleId: string): Finding {
  const finding = evaluateAll(ped)
    .flatMap((result) => result.findings)
    .find((candidate) => candidate.ruleId === ruleId);
  if (!finding) throw new Error(`No rule ${ruleId}`);
  return finding;
}

export function statusOf(ped: Pedigree, guidelineId: string): FindingStatus {
  if (!getGuideline(guidelineId)) throw new Error(`No guideline ${guidelineId}`);
  const result = evaluateAll(ped).find((candidate) => candidate.guidelineId === guidelineId);
  return result?.status ?? 'none';
}

export const GUIDELINE_IDS = [
  'nice-cg164',
  'amsterdam-ii',
  'nice-cg71',
  'dlcn-family-history',
  'nice-ng238',
] as const;

/** Families covering every status of every guideline, reused by the loop tests. */
export const CASES: Affected[] = [
  {},
  { mom: [['breast', 38]] },
  { mom: [['breast', 60]] },
  { mom: [['breast']] },
  { dad: [['breast', 70]] },
  { mom: [['breast', 60]], mgm: [['breast', 70]] },
  { mom: [['breast', 60]], paunt: [['breast', 55]] },
  { mom: [['breast', 60]], maunt: [['ovarian', 50]] },
  { mgm: [['breast', 70]], maunt: [['breast', 55]], muncle: [['breast', 66]] },
  { sibx: [['breast', 35]] },
  { mom: [['colorectal', 49]], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] },
  { mom: [['colorectal']], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] },
  { me: [['colorectal', 45]], sis: [['colorectal', 60]], bro: [['colorectal', 61]] },
  { dad: [['coronary_event', 54]] },
  { dad: [['coronary_event', 57]] },
  { dad: [['coronary_event', 61]] },
  { mom: [['coronary_event', 59]] },
  { sis: [['coronary_event']] },
  { sibx: [['coronary_event', 57]] },
  { puncle: [['coronary_event', 40]], stepmom: [['breast', 30]] },
  { mom: [['breast', 35, { confirmed: 'unsure' }]], dad: [['coronary_event', 50, { confirmed: 'reported' }]] },
];
