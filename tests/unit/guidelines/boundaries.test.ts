import type { Condition, ConditionCode, Confirmation, Pedigree } from '../../../src/domain';
import { evaluateAll, listGuidelines } from '../../../src/guidelines';
import { buildPedigree } from '../../fixtures/pedigrees';

// Every "before age N" threshold, checked at N - 1 and at N, and the edge cases that
// mutation testing (npm run test:mutation) showed were not pinned down: an "unsure"
// condition exactly at a limit, and the exclusion reason exactly at a limit.

function condition(code: ConditionCode, age: number, confirmed: Confirmation = 'confirmed'): Condition {
  return {
    id: `c${age}${code}`,
    code,
    domain: code === 'coronary_event' ? 'cardio' : 'cancer',
    ageAtOnset: age,
    ageUnknown: false,
    confirmed,
    ...(code === 'breast' && { laterality: 'left' as const }),
  };
}

/** The proband with a mother and father; the given person carries the given conditions. */
function parents(who: 'mum' | 'dad' | 'me', conditions: Condition[], sexOfParent?: 'unknown'): Pedigree {
  return buildPedigree({
    people: `me:f mum:${sexOfParent === 'unknown' ? 'u' : 'f'} dad:m`,
    details: { [who]: { conditions } },
    bio: 'me<mum+dad',
  });
}

const rule = (ped: Pedigree, ruleId: string) => {
  const finding = evaluateAll(ped, { referenceYear: 2026 }).flatMap((r) => r.findings).find((f) => f.ruleId === ruleId);
  if (!finding) throw new Error(`no finding for ${ruleId}`);
  return finding;
};
const exclusionFor = (ped: Pedigree, ruleId: string, personId: string) =>
  listGuidelines().flatMap((g) => g.rules).find((r) => r.id === ruleId)?.explainExclusions(ped).find((e) => e.personId === personId)?.reason;

describe('age thresholds at N - 1 and N', () => {
  it.each([
    ['cg164-female-under-40', 'mum', 'breast', 39, 40, 'meets'],
    ['cg71-premature-chd', 'dad', 'coronary_event', 59, 60, 'discuss'],
    ['cg71-premature-chd', 'me', 'coronary_event', 59, 60, 'discuss'],
    ['ng238-family-history', 'dad', 'coronary_event', 59, 60, 'discuss'],
    ['dlcn-family-history', 'dad', 'coronary_event', 54, 55, 'discuss'],
    ['dlcn-family-history', 'mum', 'coronary_event', 59, 60, 'discuss'],
  ] as const)('%s: %s at %i counts, at %i does not', (ruleId, who, code, below, at, metStatus) => {
    expect(rule(parents(who, [condition(code, below)]), ruleId).status).toBe(metStatus);
    expect(rule(parents(who, [condition(code, at)]), ruleId).status).toBe('none');
  });

  it('DLCN, parent of unknown sex: under 55 counts, 55 to 59 is unknown, 60 does not', () => {
    const at = (age: number) => rule(parents('mum', [condition('coronary_event', age)], 'unknown'), 'dlcn-family-history');
    expect(at(54).reason).toBe('guideline-advises-discussion');
    expect(at(55).reason).toBe('could-be-met-if-completed');
    expect(at(59).reason).toBe('could-be-met-if-completed');
    expect(at(60).status).toBe('none');
  });
});

describe('an "unsure" condition exactly at a limit', () => {
  it('below the limit it leaves the rule open; at the limit it cannot qualify, so nothing is open', () => {
    const below = rule(parents('mum', [condition('breast', 39, 'unsure')]), 'cg164-female-under-40');
    expect(below.reason).toBe('could-be-met-if-completed');
    expect(below.unknowns.map((g) => g.field)).toContain('conditionConfirmation');
    const at = rule(parents('mum', [condition('breast', 40, 'unsure')]), 'cg164-female-under-40');
    expect(at.status).toBe('none');
    expect(at.unknowns.map((g) => g.field)).not.toContain('conditionConfirmation');
  });
});

describe('exclusion reasons exactly at a limit', () => {
  it('an onset at the limit is "above the threshold"; one below is counted, not excluded', () => {
    expect(exclusionFor(parents('mum', [condition('breast', 40)]), 'cg164-female-under-40', 'mum')).toMatch(/above the under-40 threshold/);
    expect(exclusionFor(parents('mum', [condition('breast', 39)]), 'cg164-female-under-40', 'mum')).toBeUndefined();
    expect(exclusionFor(parents('dad', [condition('coronary_event', 55)]), 'dlcn-family-history', 'dad')).toMatch(/under-55 threshold for men/);
    expect(exclusionFor(parents('dad', [condition('coronary_event', 60)]), 'ng238-family-history', 'dad')).toMatch(/under-60 threshold/);
  });
});

describe('a guideline\'s overall status is its strongest rule', () => {
  it('CG164 with one rule met and others not is Meets criteria, with only that rule\'s evidence', () => {
    const ped = parents('mum', [condition('breast', 35)]);
    const cg164 = evaluateAll(ped, { referenceYear: 2026 }).find((r) => r.guidelineId === 'nice-cg164');
    expect(cg164?.status).toBe('meets');
    expect(cg164?.evidence).toEqual(['mum']);
  });
});
