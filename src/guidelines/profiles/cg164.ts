import { t } from '../../i18n';
import {
  FAMILY_SIDES,
  assessCondition,
  assessSex,
  candidatesFrom,
  certain,
  countOutcome,
  describe,
  gapFor,
  notBefore,
  notOfSex,
  onSide,
  outcome,
  refine,
} from '../candidates';
import type { Assessment, Candidate, ExclusionTest } from '../candidates';
import { defineGuideline, defineRule, defineSteps } from '../engine';
import type { Member, Rule, RuleContext, StepOutcome } from '../types';

// NICE CG164 recommendation 1.3.3. Source notes and reading decisions: docs/RULES.md.

const ID = 'nice-cg164';
const BREAST = ['breast'] as const;
const OVARIAN = ['ovarian'] as const;
const BREAST_OR_OVARIAN = ['breast', 'ovarian'] as const;
const FEMALE_BEFORE_AGE = 40;
const BILATERAL_FIRST_PRIMARY_BEFORE_AGE = 50;

const isFirstDegree = (candidate: Candidate) => candidate.member.degree === 1;
const withBreastAge = (member: Member) => describe(member, BREAST);
const withAnyAge = (member: Member) => describe(member, BREAST_OR_OVARIAN);

function relativesWith(
  ctx: RuleContext,
  codes: readonly ('breast' | 'ovarian')[],
  degrees: readonly number[],
): Candidate[] {
  return candidatesFrom(
    ctx.relatives.filter((member) => degrees.includes(member.degree)),
    (member) => assessCondition(member, codes),
  );
}

/** Both breasts affected: recorded as bilateral, or a left and a right cancer recorded. */
function assessBilateral(member: Member): Assessment {
  const breast = member.person.conditions.filter((condition) => condition.code === 'breast');
  const counted = breast.filter((condition) => condition.confirmed !== 'unsure');
  const saysBilateral = (condition: (typeof breast)[number]) =>
    condition.laterality === 'bilateral' || /bilateral/i.test(condition.subtype ?? '');
  const has = (side: 'left' | 'right') => counted.some((c) => c.laterality === side);
  if (counted.some(saysBilateral) || (has('left') && has('right'))) {
    return { result: 'passed', gaps: [], selfReported: false };
  }
  const notRecorded = breast.some(
    (condition) => condition.laterality === undefined || condition.laterality === 'unknown',
  );
  if (notRecorded || breast.some(saysBilateral)) {
    return { result: 'unknown', gaps: [gapFor(member, 'conditionLaterality')], selfReported: false };
  }
  return { result: 'failed', gaps: [], selfReported: false };
}

/**
 * A step that needs a group of relatives: at least `need` of them, optionally
 * including a first-degree relative, optionally all on one side of the family.
 */
function groupOutcome(
  text: string,
  candidates: readonly Candidate[],
  rule: { need: number; needFirstDegree?: boolean; sameSide?: boolean },
): StepOutcome {
  const scopes = rule.sameSide
    ? FAMILY_SIDES.map((side) => candidates.filter((c) => onSide(c.member, side)))
    : [candidates];
  const enough = (group: readonly Candidate[]) =>
    group.length >= rule.need && (rule.needFirstDegree !== true || group.some(isFirstDegree));
  const sure = scopes.map(certain).filter(enough).flat();
  const possible = scopes.filter(enough).flat();
  return outcome({
    text,
    sure,
    possible,
    met: sure.length > 0,
    couldBeMet: possible.length > 0,
    describeMember: withBreastAge,
  });
}

/** A step that needs one relative with breast cancer and a different one with ovarian cancer. */
function pairOutcome(
  text: string,
  breast: readonly Candidate[],
  ovarian: readonly Candidate[],
  rule: { needFirstDegree?: boolean; sameSide?: boolean },
): StepOutcome {
  const sure: Candidate[] = [];
  const possible: Candidate[] = [];
  const sides = rule.sameSide ? FAMILY_SIDES : [null];
  for (const side of sides) {
    const inScope = (candidate: Candidate) => side === null || onSide(candidate.member, side);
    for (const b of breast.filter(inScope)) {
      for (const o of ovarian.filter(inScope)) {
        if (b.member.id === o.member.id) continue;
        if (rule.needFirstDegree === true && !isFirstDegree(b) && !isFirstDegree(o)) continue;
        possible.push(b, o);
        if (b.state === 'passed' && o.state === 'passed') sure.push(b, o);
      }
    }
  }
  return outcome({
    text,
    sure,
    possible,
    met: sure.length > 0,
    couldBeMet: possible.length > 0,
    describeMember: withAnyAge,
  });
}

const firstDegreeBreastText = () => t('g.cg164.step.firstDegreeBreast');

const notBilateral: ExclusionTest = (member, who) => {
  const { result } = assessBilateral(member);
  if (result === 'passed') return null;
  return t(result === 'unknown' ? 'g.excl.lateralityMissing' : 'g.excl.notBilateral', { who });
};

const FIRST_DEGREE_ONLY = { degrees: [1], degreeReason: 'g.excl.onlyFirst' } as const;
const FIRST_OR_SECOND = { degrees: [1, 2], degreeReason: 'g.excl.onlyFirstAndSecond' } as const;

const femaleUnder40: Rule = defineRule(
  {
  id: 'cg164-female-under-40',
  title: t('g.cg164.rule.femaleUnder40', { age: FEMALE_BEFORE_AGE }),
  outcomeWhenMet: 'meets',
  thresholds: {
    key: 'g.threshold.cg164.femaleUnder40',
    params: { age: FEMALE_BEFORE_AGE },
    ageLimits: { female: FEMALE_BEFORE_AGE },
    countsSelf: false,
    conditions: BREAST,
  },
  steps: defineSteps(
    'cg164-female-under-40',
    [{ id: 'first-degree-breast' }, { id: 'female' }, { id: 'before-40' }],
    (ctx) => {
      const affected = relativesWith(ctx, BREAST, [1]);
      const female = refine(affected, (member) => assessSex(member, 'female'));
      const young = refine(female, (member) =>
        assessCondition(member, BREAST, { before: FEMALE_BEFORE_AGE }),
      );
      return [
        countOutcome(firstDegreeBreastText(), affected, 1, withBreastAge),
        countOutcome(t('g.cg164.step.female'), female, 1),
        countOutcome(t('g.cg164.step.before', { age: FEMALE_BEFORE_AGE }), young, 1, withBreastAge),
      ];
    },
  ),
  },
  { ...FIRST_DEGREE_ONLY, tests: [notOfSex('female'), notBefore(BREAST, FEMALE_BEFORE_AGE)], fallback: 'g.excl.notEnough' },
);

const maleAnyAge: Rule = defineRule(
  {
  id: 'cg164-male-any-age',
  title: t('g.cg164.rule.maleAnyAge'),
  outcomeWhenMet: 'meets',
  thresholds: {
    key: 'g.threshold.cg164.maleAnyAge',
    params: {},
    ageLimits: {},
    countsSelf: false,
    conditions: BREAST,
  },
  steps: defineSteps('cg164-male-any-age', [{ id: 'first-degree-breast' }, { id: 'male' }], (ctx) => {
    const affected = relativesWith(ctx, BREAST, [1]);
    const male = refine(affected, (member) => assessSex(member, 'male'));
    return [
      countOutcome(firstDegreeBreastText(), affected, 1, withBreastAge),
      countOutcome(t('g.cg164.step.male'), male, 1, withBreastAge),
    ];
  }),
  },
  { ...FIRST_DEGREE_ONLY, tests: [notOfSex('male')], fallback: 'g.excl.notEnough' },
);

const bilateralUnder50: Rule = defineRule(
  {
  id: 'cg164-bilateral-under-50',
  title: t('g.cg164.rule.bilateralUnder50', { age: BILATERAL_FIRST_PRIMARY_BEFORE_AGE }),
  outcomeWhenMet: 'meets',
  thresholds: {
    key: 'g.threshold.cg164.bilateralUnder50',
    params: { age: BILATERAL_FIRST_PRIMARY_BEFORE_AGE },
    ageLimits: { any: BILATERAL_FIRST_PRIMARY_BEFORE_AGE },
    countsSelf: false,
    conditions: BREAST,
  },
  steps: defineSteps(
    'cg164-bilateral-under-50',
    [{ id: 'first-degree-breast' }, { id: 'bilateral' }, { id: 'first-primary-before-50' }],
    (ctx) => {
      const affected = relativesWith(ctx, BREAST, [1]);
      const bilateral = refine(affected, assessBilateral);
      // Any breast cancer before the age means the first one was before it.
      const early = refine(bilateral, (member) =>
        assessCondition(member, BREAST, { before: BILATERAL_FIRST_PRIMARY_BEFORE_AGE }),
      );
      return [
        countOutcome(firstDegreeBreastText(), affected, 1, withBreastAge),
        countOutcome(t('g.cg164.step.bilateral'), bilateral, 1),
        countOutcome(
          t('g.cg164.step.firstPrimaryBefore', { age: BILATERAL_FIRST_PRIMARY_BEFORE_AGE }),
          early,
          1,
          withBreastAge,
        ),
      ];
    },
  ),
  },
  {
    ...FIRST_DEGREE_ONLY,
    tests: [notBilateral, notBefore(BREAST, BILATERAL_FIRST_PRIMARY_BEFORE_AGE)],
    fallback: 'g.excl.notEnough',
  },
);

const twoRelatives: Rule = defineRule(
  {
  id: 'cg164-two-relatives',
  title: t('g.cg164.rule.twoRelatives'),
  outcomeWhenMet: 'meets',
  thresholds: {
    key: 'g.threshold.cg164.twoRelatives',
    params: {},
    ageLimits: {},
    countsSelf: false,
    conditions: BREAST,
  },
  steps: defineSteps(
    'cg164-two-relatives',
    [{ id: 'two-with-breast' }, { id: 'one-first-degree' }, { id: 'same-side' }],
    (ctx) => {
      const affected = relativesWith(ctx, BREAST, [1, 2]);
      return [
        groupOutcome(t('g.cg164.step.twoBreast'), affected, { need: 2 }),
        groupOutcome(t('g.cg164.step.oneFirstDegree'), affected, { need: 2, needFirstDegree: true }),
        groupOutcome(t('g.cg164.step.sameSide'), affected, {
          need: 2,
          needFirstDegree: true,
          sameSide: true,
        }),
      ];
    },
  ),
  },
  { ...FIRST_OR_SECOND, fallback: 'g.excl.needsGroup' },
);

const breastAndOvarian: Rule = defineRule(
  {
  id: 'cg164-breast-and-ovarian',
  title: t('g.cg164.rule.breastAndOvarian'),
  outcomeWhenMet: 'meets',
  thresholds: {
    key: 'g.threshold.cg164.breastAndOvarian',
    params: {},
    ageLimits: {},
    countsSelf: false,
    conditions: BREAST_OR_OVARIAN,
  },
  steps: defineSteps(
    'cg164-breast-and-ovarian',
    [{ id: 'breast-and-ovarian' }, { id: 'one-first-degree' }, { id: 'same-side' }],
    (ctx) => {
      const breast = relativesWith(ctx, BREAST, [1, 2]);
      const ovarian = relativesWith(ctx, OVARIAN, [1, 2]);
      return [
        pairOutcome(t('g.cg164.step.breastAndOvarian'), breast, ovarian, {}),
        pairOutcome(t('g.cg164.step.oneFirstDegree'), breast, ovarian, { needFirstDegree: true }),
        pairOutcome(t('g.cg164.step.sameSide'), breast, ovarian, {
          needFirstDegree: true,
          sameSide: true,
        }),
      ];
    },
  ),
  },
  { ...FIRST_OR_SECOND, fallback: 'g.excl.needsGroup' },
);

const threeRelatives: Rule = defineRule(
  {
  id: 'cg164-three-relatives',
  title: t('g.cg164.rule.threeRelatives'),
  outcomeWhenMet: 'meets',
  thresholds: {
    key: 'g.threshold.cg164.threeRelatives',
    params: {},
    ageLimits: {},
    countsSelf: false,
    conditions: BREAST,
  },
  steps: defineSteps(
    'cg164-three-relatives',
    [{ id: 'three-with-breast' }, { id: 'same-side' }],
    (ctx) => {
      const affected = relativesWith(ctx, BREAST, [1, 2]);
      return [
        groupOutcome(t('g.cg164.step.threeBreast'), affected, { need: 3 }),
        groupOutcome(t('g.cg164.step.sameSide'), affected, { need: 3, sameSide: true }),
      ];
    },
  ),
  },
  { ...FIRST_OR_SECOND, fallback: 'g.excl.needsGroup' },
);

export const cg164 = defineGuideline({
  id: ID,
  name: t('g.cg164.name'),
  shortName: t('g.cg164.shortName'),
  sourceTitle: t('g.cg164.sourceTitle'),
  sourceUrl: 'https://www.nice.org.uk/guidance/cg164/chapter/Recommendations',
  publisher: t('g.publisher.nice'),
  countryOrScope: t('g.scope.nice'),
  domain: 'cancer',
  lastReviewed: '2026-11-11',
  rules: [
    femaleUnder40,
    maleAnyAge,
    bilateralUnder50,
    twoRelatives,
    breastAndOvarian,
    threeRelatives,
  ],
});
