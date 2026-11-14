import type { ConditionCode, Gap, Pedigree, Person, PersonId, Side } from '../domain';
import type { MessageKey } from '../i18n';

export type StepResult = 'passed' | 'failed' | 'unknown';
export type FindingStatus = 'meets' | 'discuss' | 'none';
export type FindingReason =
  | 'criteria-met'
  | 'guideline-advises-discussion'
  | 'could-be-met-if-completed'
  | 'not-met';

export interface EvaluateOptions {
  /** Current year, passed in so that nothing here reads the clock. */
  referenceYear?: number;
}

/** The proband (degree 0) or one of their blood relatives up to third degree. */
export interface Member {
  id: PersonId;
  person: Person;
  degree: 0 | 1 | 2 | 3;
  side: Side;
  generationDelta: number;
  /** How the person is named in sentences: "you", "your mother". */
  name: string;
}

/** Everything a step may look at. Built once per evaluation. */
export interface RuleContext {
  ped: Pedigree;
  proband: Member;
  /** Blood relatives up to third degree. Step and adoptive relatives are never here. */
  relatives: Member[];
  /** Step results already worked out in this evaluation, by rule id. */
  cache: Map<string, StepOutcome[]>;
}

export interface StepOutcome {
  result: StepResult;
  /** The people this result rests on. */
  evidence: PersonId[];
  /** A sentence a person can read. */
  text: string;
  /** What is missing, when the result is unknown. */
  gaps: Gap[];
  /** Evidence people whose relevant condition is self-reported, not confirmed. */
  selfReported: PersonId[];
}

export interface StepDef {
  id: string;
  /**
   * The step needs information only a clinician holds. It is always shown
   * and never changes the finding's status.
   */
  clinicianConfirms?: boolean;
  /** Pure: same context, same outcome. */
  evaluate(ctx: RuleContext): StepOutcome;
}

/** What a rule counts, in plain words and as data the comparison page can reason about. */
export interface RuleThresholds {
  /** The key threshold in plain words: i18n key plus its params. */
  key: MessageKey;
  params: Record<string, string | number>;
  /** The "before age N" limits the rule uses; empty when it has none. */
  ageLimits: { any?: number; male?: number; female?: number };
  /** Whether the person's own history counts, as well as relatives'. */
  countsSelf: boolean;
  /** The conditions the rule looks at. */
  conditions: readonly ConditionCode[];
}

/** A person the rule saw (they have a condition it looks at) but did not count, and why. */
export interface Exclusion {
  personId: PersonId;
  reason: string;
}

export interface Rule {
  id: string;
  title: string;
  outcomeWhenMet: 'meets' | 'discuss';
  steps: StepDef[];
  thresholds: RuleThresholds;
  /** Pure: the people with a relevant condition whom this rule does not count, each with the reason. */
  explainExclusions(ped: Pedigree): Exclusion[];
}

export interface FindingStep {
  text: string;
  result: StepResult;
  evidence: PersonId[];
  clinicianConfirms: boolean;
}

export interface Finding {
  guidelineId: string;
  ruleId: string;
  status: FindingStatus;
  reason: FindingReason;
  summary: string;
  steps: FindingStep[];
  /** The relatives who triggered the finding; empty when no criteria are met. */
  evidence: PersonId[];
  /** Missing information that affects this finding. */
  unknowns: Gap[];
  /** Evidence people whose condition is self-reported, so the UI can label it. */
  selfReportedEvidence: PersonId[];
}

export type GuidelineDomain = 'cancer' | 'cardio';

export interface GuidelineProfile {
  id: string;
  name: string;
  shortName: string;
  sourceTitle: string;
  sourceUrl: string;
  publisher: string;
  countryOrScope: string;
  domain: GuidelineDomain;
  /** ISO date on which the source was last read against these rules. */
  lastReviewed: string;
  rules: Rule[];
  evaluate(ped: Pedigree, opts?: EvaluateOptions): Finding[];
}

/** One guideline's findings with its overall status: the strongest of its rules. */
export interface GuidelineResult {
  guidelineId: string;
  status: FindingStatus;
  findings: Finding[];
  /** Evidence from the findings that carry the overall status. */
  evidence: PersonId[];
}
