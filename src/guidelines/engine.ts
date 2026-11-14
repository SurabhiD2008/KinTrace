import { completeness, relativesOf } from '../domain';
import type { Gap, Pedigree, PersonId } from '../domain';
import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { uniqueGaps, whoText } from './candidates';
import type { ExclusionTest } from './candidates';
import type {
  EvaluateOptions,
  Finding,
  FindingReason,
  FindingStatus,
  GuidelineProfile,
  GuidelineResult,
  Member,
  Rule,
  RuleContext,
  StepDef,
  StepOutcome,
} from './types';

/** Builds the proband and their blood relatives once, for all rules of a guideline. */
export function buildContext(ped: Pedigree): RuleContext | null {
  const person = ped.persons[ped.probandId];
  if (!person) return null;
  const proband: Member = {
    id: person.id,
    person,
    degree: 0,
    side: 'both',
    generationDelta: 0,
    name: t('person.you'),
  };
  const relatives: Member[] = [];
  for (const { personId, relationship } of relativesOf(ped, ped.probandId, 3)) {
    const relative = ped.persons[personId];
    if (!relative || relationship.degree === null) continue;
    relatives.push({
      id: personId,
      person: relative,
      degree: relationship.degree,
      side: relationship.side,
      generationDelta: relationship.generationDelta,
      name: t('person.the', { label: relationship.label }),
    });
  }
  return { ped, proband, relatives, cache: new Map() };
}

/**
 * Defines a rule's steps from one analysis that returns an outcome per step.
 * Later steps build on earlier ones, so the analysis runs once per
 * evaluation and each step reads its own outcome from it.
 */
export function defineSteps(
  ruleId: string,
  steps: readonly { id: string; clinicianConfirms?: boolean }[],
  analyse: (ctx: RuleContext) => StepOutcome[],
): StepDef[] {
  return steps.map((step, index) => ({
    id: step.id,
    ...(step.clinicianConfirms === true && { clinicianConfirms: true }),
    evaluate(ctx) {
      let outcomes = ctx.cache.get(ruleId);
      if (!outcomes) {
        outcomes = analyse(ctx);
        ctx.cache.set(ruleId, outcomes);
      }
      const outcome = outcomes[index];
      if (!outcome) throw new Error(`Rule ${ruleId} produced no outcome for step ${step.id}`);
      return outcome;
    },
  }));
}

/** How a rule explains the people it saw but did not count. Tests run in order; the first reason wins. */
export interface ExclusionSpec {
  /** The degrees of relationship that can count; 0 is the person themself. */
  degrees: readonly Member['degree'][];
  /** The sentence for a relative of any other degree; takes {who} and {degree}. */
  degreeReason: MessageKey;
  tests?: readonly ExclusionTest[];
  /** The sentence for someone no test excludes: they are relevant, but the rule as a whole is not met. */
  fallback: MessageKey;
}

const DEGREE_WORD = { 1: 'g.degree.1', 2: 'g.degree.2', 3: 'g.degree.3' } as const;

/**
 * Completes a rule with explainExclusions. The people a rule counts are read
 * from the same step outcomes the finding uses, so a person is never both
 * counted and excluded.
 */
export function defineRule(rule: Omit<Rule, 'explainExclusions'>, spec: ExclusionSpec): Rule {
  const codes = rule.thresholds.conditions;
  const reasonFor = (member: Member): string => {
    const who = whoText(member, codes);
    const relevant = member.person.conditions.filter((condition) => codes.includes(condition.code));
    if (relevant.every((condition) => condition.confirmed === 'unsure')) {
      return t('g.excl.unsure', { who });
    }
    if (!spec.degrees.includes(member.degree)) {
      return member.degree === 0
        ? t('g.excl.self', { who })
        : t(spec.degreeReason, { who, degree: t(DEGREE_WORD[member.degree]) });
    }
    for (const test of spec.tests ?? []) {
      const reason = test(member, who);
      if (reason !== null) return reason;
    }
    return t(spec.fallback, { who });
  };

  return {
    ...rule,
    explainExclusions(ped) {
      const ctx = buildContext(ped);
      if (!ctx) return [];
      const deciding = rule.steps
        .filter((step) => step.clinicianConfirms !== true)
        .map((step) => step.evaluate(ctx));
      const last = deciding[deciding.length - 1];
      // The same people evaluateRule reports as the finding's evidence.
      const counted = new Set(
        !last || deciding.some((outcome) => outcome.result === 'failed') ? [] : last.evidence,
      );
      return [ctx.proband, ...ctx.relatives]
        .filter(
          (member) =>
            !counted.has(member.id) &&
            member.person.conditions.some((condition) => codes.includes(condition.code)),
        )
        .map((member) => ({ personId: member.id, reason: reasonFor(member) }));
    },
  };
}

function decide(
  rule: Rule,
  deciding: readonly StepOutcome[],
): { status: FindingStatus; reason: FindingReason } {
  if (deciding.some((outcome) => outcome.result === 'failed')) {
    return { status: 'none', reason: 'not-met' };
  }
  if (deciding.some((outcome) => outcome.result === 'unknown')) {
    return { status: 'discuss', reason: 'could-be-met-if-completed' };
  }
  return rule.outcomeWhenMet === 'meets'
    ? { status: 'meets', reason: 'criteria-met' }
    : { status: 'discuss', reason: 'guideline-advises-discussion' };
}

const SUMMARY_KEY = {
  'criteria-met': 'g.summary.met',
  'guideline-advises-discussion': 'g.summary.advised',
  'could-be-met-if-completed': 'g.summary.couldBeMet',
  'not-met': 'g.summary.notMet',
} as const;

export function evaluateRule(
  guidelineId: string,
  rule: Rule,
  ctx: RuleContext,
  parentGaps: readonly Gap[],
): Finding {
  const outcomes = rule.steps.map((step) => ({ step, outcome: step.evaluate(ctx) }));
  // Steps only a clinician can confirm are shown but never decide the status.
  const deciding = outcomes
    .filter(({ step }) => step.clinicianConfirms !== true)
    .map(({ outcome }) => outcome);
  const { status, reason } = decide(rule, deciding);
  const last = deciding[deciding.length - 1];
  const evidence: PersonId[] = status === 'none' || !last ? [] : last.evidence;
  const stepGaps =
    status === 'none'
      ? []
      : deciding.filter((outcome) => outcome.result === 'unknown').flatMap((o) => o.gaps);

  return {
    guidelineId,
    ruleId: rule.id,
    status,
    reason,
    summary: t(SUMMARY_KEY[reason], { title: rule.title }),
    steps: outcomes.map(({ step, outcome }) => ({
      text: outcome.text,
      result: outcome.result,
      evidence: outcome.evidence,
      clinicianConfirms: step.clinicianConfirms === true,
    })),
    evidence,
    // Unknown biological parents of the proband hide relatives from every rule.
    // Each missing parent is its own gap, so those are not merged.
    unknowns: [...uniqueGaps(stepGaps), ...parentGaps],
    selfReportedEvidence:
      status === 'none' || !last ? [] : last.selfReported.filter((id) => evidence.includes(id)),
  };
}

type ProfileInfo = Omit<GuidelineProfile, 'evaluate'>;

/** Completes a guideline profile with its evaluate function. */
export function defineGuideline(info: ProfileInfo): GuidelineProfile {
  return {
    ...info,
    evaluate(ped: Pedigree, opts: EvaluateOptions = {}): Finding[] {
      const ctx = buildContext(ped);
      if (!ctx) return [];
      const parentGaps = completeness(ped, opts).gaps.filter(
        (gap) => gap.field === 'biologicalParent',
      );
      return info.rules.map((rule) => evaluateRule(info.id, rule, ctx, parentGaps));
    },
  };
}

const STRENGTH: Record<FindingStatus, number> = { none: 0, discuss: 1, meets: 2 };

/** A guideline's overall status is the strongest status among its rules. */
export function summarise(guidelineId: string, findings: Finding[]): GuidelineResult {
  const status = findings.reduce<FindingStatus>(
    (best, finding) => (STRENGTH[finding.status] > STRENGTH[best] ? finding.status : best),
    'none',
  );
  const evidence =
    status === 'none'
      ? []
      : [
          ...new Set(
            findings.filter((finding) => finding.status === status).flatMap((f) => f.evidence),
          ),
        ];
  return { guidelineId, status, findings, evidence };
}
