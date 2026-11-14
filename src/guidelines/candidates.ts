import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import type { ConditionCode, Gap, GapField, Side } from '../domain';
import type { Member, StepOutcome, StepResult } from './types';

// Shared building blocks for rules: three-valued tests on a person, and
// "candidates" that carry how certain we are about each person so far.

const GAP_WEIGHT = { 0: 3, 1: 3, 2: 2, 3: 1 } as const;

export function gapFor(member: Member, field: GapField): Gap {
  const key: MessageKey = `gap.${field}`;
  return {
    personId: member.id,
    field,
    weight: GAP_WEIGHT[member.degree],
    text: t(key, { name: member.name }),
  };
}

/** The result of testing one person: three-valued, with what is missing. */
export interface Assessment {
  result: StepResult;
  gaps: Gap[];
  /** The qualifying conditions are all self-reported (none is confirmed). */
  selfReported: boolean;
}

const FAILED: Assessment = { result: 'failed', gaps: [], selfReported: false };
const PASSED: Assessment = { result: 'passed', gaps: [], selfReported: false };

/**
 * Has this person had one of these conditions, optionally before an age?
 * "Unsure" conditions are never counted: they make the answer unknown.
 * A missing age at onset makes an age test unknown, never passed or failed.
 */
export function assessCondition(
  member: Member,
  codes: readonly ConditionCode[],
  options: { before?: number } = {},
): Assessment {
  const { before } = options;
  const matching = member.person.conditions.filter((condition) => codes.includes(condition.code));
  const counted = matching.filter((condition) => condition.confirmed !== 'unsure');
  const unsure = matching.filter((condition) => condition.confirmed === 'unsure');

  const qualifying =
    before === undefined
      ? counted
      : counted.filter(
          (condition) => condition.ageAtOnset !== undefined && condition.ageAtOnset < before,
        );
  if (qualifying.length > 0) {
    const selfReported = qualifying.every((condition) => condition.confirmed === 'reported');
    return { result: 'passed', gaps: [], selfReported };
  }

  const gaps: Gap[] = [];
  if (counted.some((condition) => condition.ageAtOnset === undefined)) {
    gaps.push(gapFor(member, 'conditionOnset'));
  }
  const unsureCouldQualify = unsure.some(
    (condition) =>
      before === undefined || condition.ageAtOnset === undefined || condition.ageAtOnset < before,
  );
  if (unsureCouldQualify) gaps.push(gapFor(member, 'conditionConfirmation'));
  return gaps.length > 0 ? { result: 'unknown', gaps, selfReported: false } : FAILED;
}

/** Is this person of the given sex? Intersex and unknown both give unknown. */
export function assessSex(member: Member, sex: 'female' | 'male'): Assessment {
  if (member.person.sex === sex) return PASSED;
  if (member.person.sex === 'female' || member.person.sex === 'male') return FAILED;
  return { result: 'unknown', gaps: [gapFor(member, 'sex')], selfReported: false };
}

/** Earliest known age at which the person had one of these conditions (unsure ones excluded). */
export function earliestOnset(member: Member, codes: readonly ConditionCode[]): number | null {
  const ages = member.person.conditions
    .filter((condition) => codes.includes(condition.code) && condition.confirmed !== 'unsure')
    .map((condition) => condition.ageAtOnset)
    .filter((age) => age !== undefined);
  return ages.length > 0 ? Math.min(...ages) : null;
}

/** A person still in the running for a criterion, and how sure we are of them. */
export interface Candidate {
  member: Member;
  /** 'passed' when every test so far passed; 'unknown' when at least one was unknown. */
  state: 'passed' | 'unknown';
  gaps: Gap[];
  selfReported: boolean;
}

/** Tests each member, keeping those who passed or might pass. */
export function candidatesFrom(
  members: readonly Member[],
  test: (member: Member) => Assessment,
): Candidate[] {
  return refine(
    members.map((member) => ({ member, state: 'passed', gaps: [], selfReported: false })),
    test,
  );
}

/** Applies a further test to each candidate, dropping those who fail it. */
export function refine(
  candidates: readonly Candidate[],
  test: (member: Member) => Assessment,
): Candidate[] {
  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    const assessment = test(candidate.member);
    if (assessment.result === 'failed') continue;
    kept.push({
      member: candidate.member,
      state: candidate.state === 'passed' && assessment.result === 'passed' ? 'passed' : 'unknown',
      gaps: [...candidate.gaps, ...assessment.gaps],
      selfReported: candidate.selfReported || assessment.selfReported,
    });
  }
  return kept;
}

export function certain(candidates: readonly Candidate[]): Candidate[] {
  return candidates.filter((candidate) => candidate.state === 'passed');
}

/**
 * Whether a relative can be combined with others on the given side of the
 * family. Siblings and their descendants are on both sides; the proband's own
 * descendants (side 'none') descend from both sides too.
 */
export function onSide(member: Member, side: 'maternal' | 'paternal'): boolean {
  const compatible: readonly Side[] = [side, 'both', 'none'];
  return compatible.includes(member.side);
}

export const FAMILY_SIDES = ['maternal', 'paternal'] as const;

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function uniqueGaps(gaps: readonly Gap[]): Gap[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.personId}|${gap.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "your mother (at 38)" or "your mother (age not recorded)", for evidence lists. */
export function describe(member: Member, codes: readonly ConditionCode[]): string {
  const age = earliestOnset(member, codes);
  return age === null
    ? t('g.person.ageUnknown', { name: member.name })
    : t('g.person.atAge', { name: member.name, age });
}

/** A fixed collation (not the device's), so the same family reads the same everywhere. */
const READING_ORDER = new Intl.Collator('en', { numeric: true });

function sentence(text: string, people: readonly string[]): string {
  return people.length === 0 ? text : t('g.step.withPeople', { text, people: people.join('; ') });
}

/**
 * Turns the candidates that satisfy a step into its outcome.
 * `sure` are the people who certainly satisfy it and `possible` those who
 * would if missing details were filled in; `met` and `couldBeMet` say whether
 * each group is enough for the step.
 */
export function outcome(args: {
  text: string;
  sure: readonly Candidate[];
  possible: readonly Candidate[];
  met: boolean;
  couldBeMet: boolean;
  describeMember?: (member: Member) => string;
}): StepOutcome {
  const name = args.describeMember ?? ((member: Member) => member.name);
  // People are listed by degree, then by how they are described (ages in number order),
  // so the sentence never depends on internal ids or the order people were added.
  const inReadingOrder = (people: readonly string[], candidates: readonly Candidate[]) => {
    const degreeOf = new Map(candidates.map((c) => [name(c.member), c.member.degree] as const));
    return [...people].sort(
      (a, b) => (degreeOf.get(a) ?? 0) - (degreeOf.get(b) ?? 0) || READING_ORDER.compare(a, b),
    );
  };
  if (args.met) {
    return {
      result: 'passed',
      evidence: unique(args.sure.map((candidate) => candidate.member.id)),
      text: sentence(
        args.text,
        inReadingOrder(unique(args.sure.map((candidate) => name(candidate.member))), args.sure),
      ),
      gaps: [],
      selfReported: unique(
        args.sure.filter((candidate) => candidate.selfReported).map((c) => c.member.id),
      ),
    };
  }
  if (args.couldBeMet) {
    const open = args.possible.filter((candidate) => candidate.state === 'unknown');
    return {
      result: 'unknown',
      evidence: unique(args.possible.map((candidate) => candidate.member.id)),
      text: sentence(
        args.text,
        inReadingOrder(unique(args.possible.map((candidate) => name(candidate.member))), args.possible),
      ),
      gaps: uniqueGaps(open.flatMap((candidate) => candidate.gaps)),
      selfReported: [],
    };
  }
  return { result: 'failed', evidence: [], text: args.text, gaps: [], selfReported: [] };
}

/** The usual case: the step needs at least `need` candidates. */
export function countOutcome(
  text: string,
  candidates: readonly Candidate[],
  need: number,
  describeMember?: (member: Member) => string,
): StepOutcome {
  const sure = certain(candidates);
  return outcome({
    text,
    sure,
    possible: candidates,
    met: sure.length >= need,
    couldBeMet: candidates.length >= need,
    ...(describeMember && { describeMember }),
  });
}

/** A step KinTrace cannot check: always unknown, for the clinician to confirm. */
export function clinicianStep(text: string): StepOutcome {
  return { result: 'unknown', evidence: [], text, gaps: [], selfReported: [] };
}

// Reasons a relative with a relevant condition is not counted by a rule.
// Each test returns a sentence, or null when it does not exclude the person.

export type ExclusionTest = (member: Member, who: string) => string | null;

/** "Your father, 57", or "Your father" when no age is recorded. Starts a reason sentence. */
export function whoText(member: Member, codes: readonly ConditionCode[]): string {
  const name = member.name.charAt(0).toUpperCase() + member.name.slice(1);
  const age = earliestOnset(member, codes);
  return age === null ? name : t('g.excl.who', { name, age });
}

const ABOVE_KEY = {
  any: 'g.excl.above',
  male: 'g.excl.aboveMen',
  female: 'g.excl.aboveWomen',
} as const;

/** The reason for an event at or after a "before age N" limit, or with no age recorded. */
export function ageReason(
  member: Member,
  who: string,
  codes: readonly ConditionCode[],
  limit: number,
  sex: 'any' | 'male' | 'female' = 'any',
): string | null {
  const onset = earliestOnset(member, codes);
  if (onset === null) return t('g.excl.ageMissing', { who });
  return onset >= limit ? t(ABOVE_KEY[sex], { who, limit }) : null;
}

export function notBefore(codes: readonly ConditionCode[], limit: number): ExclusionTest {
  return (member, who) => ageReason(member, who, codes, limit);
}

/** For a criterion that names a sex: the other sex is excluded, an unrecorded one cannot be checked. */
export function notOfSex(sex: 'female' | 'male'): ExclusionTest {
  return (member, who) => {
    const { result } = assessSex(member, sex);
    if (result === 'passed') return null;
    if (result === 'unknown') return t('g.excl.sexMissing', { who });
    return t(sex === 'female' ? 'g.excl.notFemale' : 'g.excl.notMale', { who });
  };
}
