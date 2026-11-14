import { completeness, relationshipTo } from '../../domain';
import type { ConditionCode, Gap, Pedigree, Person, PersonId } from '../../domain';
import { evaluateAll, getGuideline } from '../../guidelines';
import type { FindingStatus, GuidelineProfile, GuidelineResult } from '../../guidelines';
import { formatDate, formatList, t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { capitalise, conditionName, personName, relationshipLabel } from '../../ui/pedigree/describe';

// Everything the one-page report shows, worked out once. The preview, the
// printout and the plain-text copy are all drawn from this, so they cannot
// disagree. With hideNames, no name the user typed appears anywhere in it.

export interface ReportOptions {
  hideNames: boolean;
  referenceYear: number;
  today: Date;
}

export interface ReportRelative {
  id: PersonId;
  text: string;
  selfReported: boolean;
}

export interface ReportFinding {
  guidelineId: string;
  name: string;
  status: FindingStatus;
  relatives: ReportRelative[];
  /** Relatives left off to keep the page to one sheet. */
  more: number;
}

export interface ReportModel {
  date: string;
  sources: { id: string; text: string }[];
  findings: ReportFinding[];
  evidence: PersonId[];
  unknown: string[];
  unknownMore: number;
  questions: string[];
}

const MAX_RELATIVES = 4;
const MAX_GAPS = 5;
const STATUS_KEY: Record<FindingStatus, MessageKey> = { meets: 'status.meets', discuss: 'status.discuss', none: 'status.none' };
const VERSION_KEY: Record<string, MessageKey> = {
  'nice-cg164': 'g.cg164.version',
  'amsterdam-ii': 'g.amsterdam.version',
  'nice-cg71': 'g.cg71.version',
  'dlcn-family-history': 'g.dlcn.version',
  'nice-ng238': 'g.ng238.version',
};

/** What a person is called on the report: their name, or with names hidden, how they are related. */
export function reportName(ped: Pedigree, id: PersonId, hideNames: boolean): string {
  return hideNames ? relationshipLabel(ped, id) : personName(ped, id);
}

/** "my maternal aunt", or "I" for the user: for the questions, which never use names. */
function who(ped: Pedigree, id: PersonId): string {
  if (id === ped.probandId) return t('report.whoSelf');
  return t('report.who', { label: relationshipTo(ped, ped.probandId, id).label });
}

function codesOf(guideline: GuidelineProfile): ConditionCode[] {
  return [...new Set(guideline.rules.flatMap((rule) => rule.thresholds.conditions))];
}

/** "Mother (38)": the earliest age at which the person had a condition the guideline looks at. */
function relativeText(ped: Pedigree, id: PersonId, codes: readonly ConditionCode[], hideNames: boolean): string {
  const person = ped.persons[id];
  const ages = (person?.conditions ?? [])
    .filter((c) => codes.includes(c.code) && c.ageAtOnset !== undefined)
    .map((c) => c.ageAtOnset as number);
  const name = reportName(ped, id, hideNames);
  return ages.length > 0 ? t('report.relative', { name, age: Math.min(...ages) }) : t('report.relativeAgeUnknown', { name });
}

const SUBTYPE_KEY: Record<string, MessageKey> = {
  heart_attack: 'report.subtype.heart_attack',
  bypass_surgery: 'report.subtype.bypass_surgery',
  stent: 'report.subtype.stent',
  angioplasty: 'report.subtype.angioplasty',
  angina: 'report.subtype.angina',
};

/** "a heart attack" when the kind of event is recorded, otherwise the condition's name. */
function conditionWords(condition: { code: ConditionCode; subtype?: string }): string {
  const key = condition.subtype === undefined ? undefined : SUBTYPE_KEY[condition.subtype];
  return key ? t(key) : conditionName(condition);
}

/** "my mother had breast cancer at 38", one item per relevant condition. */
function history(ped: Pedigree, ids: readonly PersonId[], codes: readonly ConditionCode[]): string[] {
  const items: string[] = [];
  for (const id of ids) {
    for (const condition of ped.persons[id]?.conditions ?? []) {
      if (!codes.includes(condition.code) || condition.confirmed === 'unsure') continue;
      const params = { who: who(ped, id), condition: conditionWords(condition) };
      items.push(
        condition.ageAtOnset === undefined
          ? t('report.history.hadNoAge', params)
          : t('report.history.had', { ...params, age: condition.ageAtOnset }),
      );
    }
  }
  return items;
}

/** The same sentence completeness() gives, but naming relatives by relationship when names are hidden. */
function gapText(ped: Pedigree, gap: Gap, hideNames: boolean): string {
  if (!hideNames) return gap.text;
  const name =
    gap.personId === ped.probandId
      ? t('person.you')
      : t('person.the', { label: relationshipTo(ped, ped.probandId, gap.personId).label });
  const key: MessageKey = `gap.${gap.field}`;
  return t(key, { name });
}

const isActive = (result: GuidelineResult) => result.status !== 'none';

function questions(ped: Pedigree, results: readonly GuidelineResult[]): string[] {
  const out: string[] = [];
  const sentence = (items: string[]) => capitalise(formatList(items));
  const of = (id: string) => results.find((r) => r.guidelineId === id);
  const ask = (ids: string[], key: MessageKey) => {
    const active = ids.map(of).filter((r): r is GuidelineResult => r !== undefined && isActive(r));
    const evidence = [...new Set(active.flatMap((r) => r.evidence))];
    const codes = [...new Set(active.flatMap((r) => codesOf(getGuideline(r.guidelineId) as GuidelineProfile)))];
    const items = history(ped, evidence, codes);
    if (items.length > 0) out.push(t(key, { history: sentence(items) }));
  };
  ask(['nice-cg164'], 'report.q.cg164');
  ask(['amsterdam-ii'], 'report.q.amsterdam');
  ask(['nice-cg71', 'dlcn-family-history', 'nice-ng238'], 'report.q.heart');

  // Findings that could change once something is filled in.
  const open = results.flatMap((r) => r.findings).filter((f) => f.reason === 'could-be-met-if-completed');
  const people = [...new Set(open.flatMap((f) => f.unknowns.map((gap) => gap.personId)))].filter((id) => id in ped.persons);
  if (people.length > 0) out.push(t('report.q.missing', { gaps: formatList(people.slice(0, 3).map((id) => who(ped, id))) }));
  if (out.length === 0) out.push(t('report.questionsNone'));
  return out;
}

export function buildReport(ped: Pedigree, options: ReportOptions): ReportModel {
  const { hideNames, referenceYear, today } = options;
  const results = evaluateAll(ped, { referenceYear });
  const findings: ReportFinding[] = results.flatMap((result) => {
    const guideline = getGuideline(result.guidelineId);
    if (!guideline) return [];
    const codes = codesOf(guideline);
    const selfReported = new Set(
      result.findings.filter((f) => f.status === result.status).flatMap((f) => f.selfReportedEvidence),
    );
    const relatives = result.evidence.map((id) => ({
      id,
      text: relativeText(ped, id, codes, hideNames),
      selfReported: selfReported.has(id),
    }));
    return [{
      guidelineId: guideline.id,
      name: guideline.shortName,
      status: result.status,
      relatives: relatives.slice(0, MAX_RELATIVES),
      more: Math.max(0, relatives.length - MAX_RELATIVES),
    }];
  });
  const sources = results.flatMap((result) => {
    const guideline = getGuideline(result.guidelineId);
    if (!guideline) return [];
    const versionKey = VERSION_KEY[guideline.id];
    return [{
      id: guideline.id,
      text: t('report.source', {
        name: guideline.shortName,
        version: versionKey ? t(versionKey) : guideline.sourceTitle,
        reviewed: formatDate(guideline.lastReviewed),
      }),
    }];
  });
  const gaps = [...completeness(ped, { referenceYear }).gaps].sort((a, b) => b.weight - a.weight);
  return {
    date: t('report.date', { date: formatDate(today) }),
    sources,
    findings,
    evidence: [...new Set(results.filter(isActive).flatMap((r) => r.evidence))],
    unknown: gaps.slice(0, MAX_GAPS).map((gap) => gapText(ped, gap, hideNames)),
    unknownMore: Math.max(0, gaps.length - MAX_GAPS),
    questions: questions(ped, results),
  };
}

/** The whole report as plain text, for pasting into an email or a patient portal. */
export function reportText(model: ReportModel): string {
  const lines = [t('report.title'), model.date, ''];
  lines.push(t('report.findings'));
  for (const finding of model.findings) {
    const list = [
      ...finding.relatives.map((r) => (r.selfReported ? `${r.text}, ${t('report.selfReported')}` : r.text)),
      ...(finding.more > 0 ? [t('report.more', { count: finding.more })] : []),
    ];
    lines.push(`- ${t('report.text.result', {
      guideline: finding.name,
      result: t(STATUS_KEY[finding.status]),
      relatives: list.length > 0 ? t('report.text.relatives', { list: list.join('; ') }) : '',
    }).trim()}`);
  }
  lines.push('', t('report.unknown'));
  if (model.unknown.length === 0) lines.push(`- ${t('report.unknownNone')}`);
  for (const gap of model.unknown) lines.push(`- ${gap}`);
  lines.push('', t('report.questions'));
  model.questions.forEach((question, index) => lines.push(`${index + 1}. ${question}`));
  lines.push('', t('report.sources'));
  for (const source of model.sources) lines.push(`- ${source.text}`);
  lines.push('', t('report.footer'));
  return lines.join('\n');
}

export { STATUS_KEY };

export const PAPER = {
  a4: { className: 'kt-paper--a4' },
  letter: { className: 'kt-paper--letter' },
} as const;
export type PaperSize = keyof typeof PAPER;

function withoutTypedText(person: Person): Person {
  const { displayName, notes, ...rest } = person;
  return rest;
}

/** A copy of the tree without any name or note the user typed. */
export function withoutNames(ped: Pedigree): Pedigree {
  const persons = Object.fromEntries(
    Object.entries(ped.persons).map(([id, person]) => [
      id,
      // The fields that can hold what the user typed about a person are left out.
      withoutTypedText(person),
    ]),
  );
  return { ...ped, persons };
}
