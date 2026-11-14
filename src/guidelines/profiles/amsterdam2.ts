import { relationshipTo } from '../../domain';
import { t } from '../../i18n';
import {
  FAMILY_SIDES,
  assessCondition,
  candidatesFrom,
  certain,
  clinicianStep,
  countOutcome,
  describe,
  onSide,
  outcome,
  refine,
} from '../candidates';
import type { Candidate } from '../candidates';
import { defineGuideline, defineRule, defineSteps } from '../engine';
import type { Member, Rule, RuleContext, StepOutcome } from '../types';

// Amsterdam II criteria (Vasen et al. 1999). Source notes: docs/RULES.md.

const LYNCH_CANCERS = ['colorectal', 'endometrial', 'small_bowel', 'ureter', 'renal_pelvis'] as const;
const MIN_AFFECTED = 3;
const ONSET_BEFORE_AGE = 50;

const withAge = (member: Member) => describe(member, LYNCH_CANCERS);

/** People who are a first-degree relative of at least two others in the group, with those others. */
function hubsWithTwoFirstDegree(ctx: RuleContext, group: readonly Candidate[]): Candidate[] {
  const members: Candidate[] = [];
  for (const hub of group) {
    const close = group.filter(
      (other) =>
        other.member.id !== hub.member.id &&
        relationshipTo(ctx.ped, hub.member.id, other.member.id).degree === 1,
    );
    if (close.length >= 2) members.push(hub, ...close);
  }
  return members;
}

/** People who have an affected relative exactly one generation above or below them. */
function inSuccessiveGenerations(group: readonly Candidate[]): Candidate[] {
  return group.filter((a) =>
    group.some((b) => Math.abs(a.member.generationDelta - b.member.generationDelta) === 1),
  );
}

function assessSide(ctx: RuleContext, affected: readonly Candidate[]): StepOutcome[] {
  const sure = certain(affected);
  const sureHubs = hubsWithTwoFirstDegree(ctx, sure);
  const possibleHubs = hubsWithTwoFirstDegree(ctx, affected);
  const sureGenerations = inSuccessiveGenerations(sure);
  const possibleGenerations = inSuccessiveGenerations(affected);
  const early = refine(affected, (member) =>
    assessCondition(member, LYNCH_CANCERS, { before: ONSET_BEFORE_AGE }),
  );
  const earlyMet = certain(early).length > 0;
  return [
    countOutcome(t('g.amsterdam.step.three', { count: MIN_AFFECTED }), affected, MIN_AFFECTED, withAge),
    outcome({
      text: t('g.amsterdam.step.firstDegree'),
      sure: sureHubs,
      possible: possibleHubs,
      met: sureHubs.length > 0,
      couldBeMet: possibleHubs.length > 0,
    }),
    outcome({
      text: t('g.amsterdam.step.generations'),
      sure: sureGenerations,
      possible: possibleGenerations,
      met: sureGenerations.length > 0,
      couldBeMet: possibleGenerations.length > 0,
    }),
    // When met, the evidence is everyone affected on this side, not only the youngest.
    outcome({
      text: t('g.amsterdam.step.before', { age: ONSET_BEFORE_AGE }),
      sure: earlyMet ? [...certain(early), ...sure] : [],
      possible: early,
      met: earlyMet,
      couldBeMet: early.length > 0,
      describeMember: withAge,
    }),
  ];
}

/** Higher is closer to being met: no failed step beats any failed step, then more passed steps. */
function progress(outcomes: readonly StepOutcome[]): number {
  const failed = outcomes.filter((o) => o.result === 'failed').length;
  const passed = outcomes.filter((o) => o.result === 'passed').length;
  return (failed === 0 ? 100 : 0) + passed * 10 - failed;
}

const rule: Rule = defineRule(
  {
  id: 'amsterdam-ii',
  title: t('g.amsterdam.rule'),
  outcomeWhenMet: 'meets',
  thresholds: {
    key: 'g.threshold.amsterdam',
    params: { count: MIN_AFFECTED, age: ONSET_BEFORE_AGE },
    ageLimits: { any: ONSET_BEFORE_AGE },
    countsSelf: true,
    conditions: LYNCH_CANCERS,
  },
  steps: defineSteps(
    'amsterdam-ii',
    [
      { id: 'three-affected' },
      { id: 'first-degree-of-two' },
      { id: 'successive-generations' },
      { id: 'one-before-50' },
      { id: 'polyposis-excluded', clinicianConfirms: true },
      { id: 'pathology-verified', clinicianConfirms: true },
    ],
    (ctx) => {
      // The criteria describe one family, so each side is assessed on its own.
      // The proband and their descendants belong to both sides.
      const affected = candidatesFrom([ctx.proband, ...ctx.relatives], (member) =>
        assessCondition(member, LYNCH_CANCERS),
      );
      const [maternal, paternal] = FAMILY_SIDES.map((side) =>
        assessSide(
          ctx,
          affected.filter((candidate) => onSide(candidate.member, side)),
        ),
      );
      const best =
        maternal && paternal && progress(paternal) > progress(maternal) ? paternal : (maternal ?? []);
      return [
        ...best,
        clinicianStep(t('g.amsterdam.step.polyposis')),
        clinicianStep(t('g.amsterdam.step.pathology')),
      ];
    },
  ),
  },
  // Everyone up to third degree can count; nobody is excluded on their own age,
  // because only one of the group has to be under the limit.
  { degrees: [0, 1, 2, 3], degreeReason: 'g.excl.notEnough', fallback: 'g.excl.notEnough' },
);

export const amsterdam2 = defineGuideline({
  id: 'amsterdam-ii',
  name: t('g.amsterdam.name'),
  shortName: t('g.amsterdam.shortName'),
  sourceTitle: t('g.amsterdam.sourceTitle'),
  sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/10348829/',
  publisher: t('g.amsterdam.publisher'),
  countryOrScope: t('g.scope.international'),
  domain: 'cancer',
  lastReviewed: '2026-11-11',
  rules: [rule],
});
