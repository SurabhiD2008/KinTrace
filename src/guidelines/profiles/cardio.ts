import { t } from '../../i18n';
import {
  ageReason,
  assessCondition,
  assessSex,
  candidatesFrom,
  clinicianStep,
  countOutcome,
  describe,
  notBefore,
  refine,
} from '../candidates';
import type { Assessment, ExclusionTest } from '../candidates';
import { defineGuideline, defineRule, defineSteps } from '../engine';
import type { Member, Rule, RuleContext } from '../types';

// NICE CG71, the Dutch Lipid Clinic Network family-history item, and NICE
// NG238. Source notes and reading decisions: docs/RULES.md.
// Second-degree relatives never count in any of these three rules.

const CORONARY = ['coronary_event'] as const;
const CG71_BEFORE_AGE = 60;
const DLCN_BEFORE_AGE = { male: 55, female: 60 } as const;
const NG238_BEFORE_AGE = 60;

const withAge = (member: Member) => describe(member, CORONARY);
const firstDegree = (ctx: RuleContext) => ctx.relatives.filter((member) => member.degree === 1);
const before = (age: number) => (member: Member) => assessCondition(member, CORONARY, { before: age });

const cg71Rule: Rule = defineRule(
  {
  id: 'cg71-premature-chd',
  title: t('g.cg71.rule', { age: CG71_BEFORE_AGE }),
  outcomeWhenMet: 'discuss',
  thresholds: {
    key: 'g.threshold.cg71',
    params: { age: CG71_BEFORE_AGE },
    ageLimits: { any: CG71_BEFORE_AGE },
    countsSelf: true,
    conditions: CORONARY,
  },
  steps: defineSteps('cg71-premature-chd', [{ id: 'coronary-event' }, { id: 'before-60' }], (ctx) => {
    // The guideline counts the person's own history as well as first-degree relatives.
    const affected = candidatesFrom([ctx.proband, ...firstDegree(ctx)], (member) =>
      assessCondition(member, CORONARY),
    );
    const early = refine(affected, before(CG71_BEFORE_AGE));
    return [
      countOutcome(t('g.cg71.step.event'), affected, 1, withAge),
      countOutcome(t('g.cardio.step.before', { age: CG71_BEFORE_AGE }), early, 1, withAge),
    ];
  }),
  },
  {
    degrees: [0, 1],
    degreeReason: 'g.excl.onlySelfAndFirst',
    tests: [notBefore(CORONARY, CG71_BEFORE_AGE)],
    fallback: 'g.excl.notEnough',
  },
);

/**
 * Premature for the relative's own sex. Without a known sex, an event before
 * the lower threshold is premature either way, one at or after the higher
 * threshold is not, and anything between is unknown.
 */
function assessPrematureForSex(member: Member): Assessment {
  const { sex } = member.person;
  if (sex === 'male' || sex === 'female') return before(DLCN_BEFORE_AGE[sex])(member);
  const lower = before(Math.min(DLCN_BEFORE_AGE.male, DLCN_BEFORE_AGE.female))(member);
  if (lower.result === 'passed') return lower;
  const upper = before(Math.max(DLCN_BEFORE_AGE.male, DLCN_BEFORE_AGE.female))(member);
  if (upper.result === 'failed') return upper;
  return {
    result: 'unknown',
    gaps: [...upper.gaps, ...assessSex(member, 'male').gaps],
    selfReported: false,
  };
}

/** The same reading as assessPrematureForSex, as a reason for not counting someone. */
const notPrematureForSex: ExclusionTest = (member, who) => {
  const { sex } = member.person;
  if (sex === 'male' || sex === 'female') {
    return ageReason(member, who, CORONARY, DLCN_BEFORE_AGE[sex], sex);
  }
  const lower = Math.min(DLCN_BEFORE_AGE.male, DLCN_BEFORE_AGE.female);
  const upper = Math.max(DLCN_BEFORE_AGE.male, DLCN_BEFORE_AGE.female);
  if (ageReason(member, who, CORONARY, lower) === null) return null;
  return ageReason(member, who, CORONARY, upper) ?? t('g.excl.sexMissing', { who });
};

const dlcnRule: Rule = defineRule(
  {
  id: 'dlcn-family-history',
  title: t('g.dlcn.rule'),
  outcomeWhenMet: 'discuss',
  thresholds: {
    key: 'g.threshold.dlcn',
    params: DLCN_BEFORE_AGE,
    ageLimits: DLCN_BEFORE_AGE,
    countsSelf: false,
    conditions: CORONARY,
  },
  steps: defineSteps(
    'dlcn-family-history',
    [
      { id: 'coronary-heart-disease' },
      { id: 'premature-for-sex' },
      { id: 'relative-ldl', clinicianConfirms: true },
      { id: 'relative-xanthoma-or-arcus', clinicianConfirms: true },
      { id: 'child-ldl', clinicianConfirms: true },
    ],
    (ctx) => {
      const affected = candidatesFrom(firstDegree(ctx), (member) => assessCondition(member, CORONARY));
      const premature = refine(affected, assessPrematureForSex);
      return [
        countOutcome(t('g.dlcn.step.event'), affected, 1, withAge),
        countOutcome(t('g.dlcn.step.premature', DLCN_BEFORE_AGE), premature, 1, withAge),
        // The remaining items of the family-history group need lab or examination data.
        clinicianStep(t('g.dlcn.step.relativeLdl')),
        clinicianStep(t('g.dlcn.step.xanthoma')),
        clinicianStep(t('g.dlcn.step.childLdl')),
      ];
    },
  ),
  },
  {
    degrees: [1],
    degreeReason: 'g.excl.onlyFirst',
    tests: [notPrematureForSex],
    fallback: 'g.excl.notEnough',
  },
);

const ng238Rule: Rule = defineRule(
  {
  id: 'ng238-family-history',
  title: t('g.ng238.rule', { age: NG238_BEFORE_AGE }),
  outcomeWhenMet: 'discuss',
  thresholds: {
    key: 'g.threshold.ng238',
    params: { age: NG238_BEFORE_AGE },
    ageLimits: { any: NG238_BEFORE_AGE },
    countsSelf: false,
    conditions: CORONARY,
  },
  steps: defineSteps('ng238-family-history', [{ id: 'angina-or-heart-attack' }, { id: 'before-60' }], (ctx) => {
    const affected = candidatesFrom(firstDegree(ctx), (member) => assessCondition(member, CORONARY));
    const early = refine(affected, before(NG238_BEFORE_AGE));
    return [
      countOutcome(t('g.ng238.step.event'), affected, 1, withAge),
      countOutcome(t('g.cardio.step.before', { age: NG238_BEFORE_AGE }), early, 1, withAge),
    ];
  }),
  },
  {
    degrees: [1],
    degreeReason: 'g.excl.onlyFirst',
    tests: [notBefore(CORONARY, NG238_BEFORE_AGE)],
    fallback: 'g.excl.notEnough',
  },
);

export const cg71 = defineGuideline({
  id: 'nice-cg71',
  name: t('g.cg71.name'),
  shortName: t('g.cg71.shortName'),
  sourceTitle: t('g.cg71.sourceTitle'),
  sourceUrl: 'https://www.nice.org.uk/guidance/cg71/chapter/Recommendations',
  publisher: t('g.publisher.nice'),
  countryOrScope: t('g.scope.nice'),
  domain: 'cardio',
  lastReviewed: '2026-11-11',
  rules: [cg71Rule],
});

export const dlcn = defineGuideline({
  id: 'dlcn-family-history',
  name: t('g.dlcn.name'),
  shortName: t('g.dlcn.shortName'),
  sourceTitle: t('g.dlcn.sourceTitle'),
  sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3844152/',
  publisher: t('g.dlcn.publisher'),
  countryOrScope: t('g.scope.international'),
  domain: 'cardio',
  lastReviewed: '2026-11-11',
  rules: [dlcnRule],
});

export const ng238 = defineGuideline({
  id: 'nice-ng238',
  name: t('g.ng238.name'),
  shortName: t('g.ng238.shortName'),
  sourceTitle: t('g.ng238.sourceTitle'),
  sourceUrl: 'https://www.nice.org.uk/guidance/ng238/chapter/Recommendations',
  publisher: t('g.publisher.nice'),
  countryOrScope: t('g.scope.nice'),
  domain: 'cardio',
  lastReviewed: '2026-11-11',
  rules: [ng238Rule],
});
