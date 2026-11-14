import {
  addChild,
  addParent,
  addPartner,
  addSibling,
  setCondition,
  updatePerson,
  validatePedigree,
} from '../domain';
import type { MutationResult, NewPersonInput, Pedigree, PersonId, Sex } from '../domain';
import { LIMITS } from '../domain/types';
import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { RELATION_KEYS, SIDES } from './types';
import type { FamilySide, ProposedCondition, ProposedEntry, RelationKey } from './types';

// Turns proposed entries into changes to the family tree, through the domain
// mutations only. Nothing is overwritten silently: a different value for
// something already recorded becomes a question for the user. Each entry is
// worked out against the tree as the entries before it would leave it, so
// "my mum" and "her sister" share one mother.

/** The user's answers for one entry. */
export interface Decision {
  /** The chosen option when the entry carries an ambiguity of kind condition or relation. */
  option?: string;
  side?: FamilySide;
  /** Which existing person the entry is about, or 'new' for someone not yet in the tree. */
  target?: PersonId | 'new';
  /** For nieces, nephews, cousins and grandchildren: whose child they are. */
  via?: PersonId | 'new';
  /** For each conflict key: keep what is recorded, or use the new value. */
  conflicts?: Record<string, 'keep' | 'replace'>;
}

export type ChoiceKind = 'option' | 'side' | 'target' | 'via' | 'conflict';

export interface Choice {
  key: string;
  kind: ChoiceKind;
  /** Option values: condition codes, relation keys, sides, person ids, 'new', 'keep' or 'replace'. */
  options: string[];
  /** The value in force: the user's answer, or a safe default. Undefined means it must be answered. */
  value?: string;
  /** For a conflict: what is recorded and what the text says. */
  conflict?: Conflict;
}

export interface Conflict {
  key: string;
  personId: PersonId;
  /** A condition code, or 'vital' for living or deceased. */
  subject: string;
  recorded: string;
  proposed: string;
}

export type PreviewStatus = 'ready' | 'needs_choice' | 'nothing_new' | 'refused';

export interface Preview {
  entryId: string;
  status: PreviewStatus;
  relation: RelationKey;
  side?: FamilySide;
  /** The person the entry is about, once it can be worked out. */
  targetId: PersonId | null;
  targetIsNew: boolean;
  /** People added only to connect the target to the tree; nothing is known about them. */
  placeholders: PersonId[];
  added: ProposedCondition[];
  /** Conditions already recorded the same way: nothing to do. */
  duplicates: ProposedCondition[];
  /** Ages that fill an age missing from a recorded condition. */
  filled: ProposedCondition[];
  markDeceased: boolean;
  choices: Choice[];
  /** Why the entry cannot be added, when refused. */
  problem?: string;
}

export interface Resolution {
  previews: Preview[];
  /** The tree with every ready entry applied, in order. */
  pedigree: Pedigree;
}

const SIDE_SEX: Record<FamilySide, Sex> = { maternal: 'female', paternal: 'male' };
const RELATION_SEX: Partial<Record<RelationKey, Sex>> = {
  mother: 'female', father: 'male', sister: 'female', brother: 'male', half_sister: 'female',
  half_brother: 'male', daughter: 'female', son: 'male', maternal_grandmother: 'female',
  maternal_grandfather: 'male', paternal_grandmother: 'female', paternal_grandfather: 'male',
  aunt: 'female', uncle: 'male', niece: 'female', nephew: 'male',
};
const GRANDPARENTS: readonly RelationKey[] = [
  'maternal_grandmother', 'maternal_grandfather', 'paternal_grandmother', 'paternal_grandfather',
];
const NEEDS_SIDE: readonly RelationKey[] = ['aunt', 'uncle', 'cousin', 'half_sister', 'half_brother'];
const PLACEHOLDER: NewPersonInput = { healthHistoryUnknown: true, vitalStatusUnknown: true };

class Refusal extends Error {}

const sexOf = (ped: Pedigree, id: PersonId): Sex => ped.persons[id]?.sex ?? 'unknown';
const bioParents = (ped: Pedigree, id: PersonId): PersonId[] =>
  ped.parentLinks.filter((l) => l.kind === 'biological' && l.childId === id).map((l) => l.parentId);
const bioChildren = (ped: Pedigree, id: PersonId) =>
  ped.parentLinks.filter((l) => l.kind === 'biological' && l.parentId === id).map((l) => l.childId);
const partnersOf = (ped: Pedigree, id: PersonId) =>
  ped.partnerships.flatMap((p) => (p.aId === id ? [p.bId] : p.bId === id ? [p.aId] : []));

/** People who share every recorded biological parent with `id`. */
function fullSiblings(ped: Pedigree, id: PersonId): PersonId[] {
  const parents = bioParents(ped, id);
  if (parents.length === 0) return [];
  return Object.keys(ped.persons).filter((other) => {
    if (other === id) return false;
    const theirs = bioParents(ped, other);
    return theirs.length === parents.length && parents.every((p) => theirs.includes(p));
  });
}

function halfSiblingsThrough(ped: Pedigree, id: PersonId, parentId: PersonId): PersonId[] {
  const full = new Set(fullSiblings(ped, id));
  return bioChildren(ped, parentId).filter((other) => other !== id && !full.has(other));
}

/** Same sex as wanted, or sex not recorded (which the entry may then fill in). */
const matchesSex = (ped: Pedigree, id: PersonId, sex: Sex | undefined) =>
  sex === undefined || sexOf(ped, id) === sex || sexOf(ped, id) === 'unknown';

/** A small builder that applies mutations in order and remembers what it created. */
class Work {
  placeholders: PersonId[] = [];
  constructor(public ped: Pedigree) {}

  run(result: MutationResult): PersonId | null {
    if (!result.ok) throw new Refusal(result.error.message);
    this.ped = result.pedigree;
    return result.createdId;
  }

  created(result: MutationResult, placeholder: boolean): PersonId {
    const id = this.run(result);
    if (id === null) throw new Refusal(t('quick.problem.generic'));
    if (placeholder) this.placeholders.push(id);
    return id;
  }

  /** The child's biological parent of this sex, adding a placeholder if there is room. */
  parent(childId: PersonId, sex: Sex, asPlaceholder: boolean, newPerson: NewPersonInput = {}): { id: PersonId; isNew: boolean } {
    const parents = bioParents(this.ped, childId);
    const exact = parents.find((p) => sexOf(this.ped, p) === sex);
    if (exact) return { id: exact, isNew: false };
    const unknown = parents.filter((p) => sexOf(this.ped, p) === 'unknown');
    if (unknown.length === 1 && unknown[0] !== undefined) return { id: unknown[0], isNew: false };
    if (parents.length >= 2) throw new Refusal(t('quick.problem.parentsFull'));
    const input = asPlaceholder ? { ...PLACEHOLDER, sex } : { ...newPerson, sex };
    return { id: this.created(addParent(this.ped, childId, input), asPlaceholder), isNew: true };
  }

  /** Makes sure a person has both biological parents, adding placeholders. */
  bothParents(id: PersonId): void {
    this.parent(id, 'female', true);
    this.parent(id, 'male', true);
  }
}

/** The relation and side once the user's answers are applied, plus anything still to ask. */
function effective(entry: ProposedEntry, decision: Decision): { relation: RelationKey; side?: FamilySide; choices: Choice[]; condition?: ProposedCondition['code'] } {
  const choices: Choice[] = [];
  let relation = entry.relation;
  let side = entry.side;
  let code: ProposedCondition['code'] | undefined;
  const ambiguity = entry.ambiguity;
  if (ambiguity && ambiguity.kind !== 'side') {
    const valid = ambiguity.options.includes(decision.option ?? '');
    choices.push({ key: 'option', kind: 'option', options: ambiguity.options, ...(valid && decision.option !== undefined && { value: decision.option }) });
    if (valid && ambiguity.kind === 'relation') {
      relation = RELATION_KEYS.find((key) => key === decision.option) ?? relation;
    }
    if (valid && ambiguity.kind === 'condition') {
      code = entry.conditions[0]?.code !== undefined ? (decision.option as ProposedCondition['code']) : undefined;
    }
  }
  const isGrandparent = GRANDPARENTS.includes(relation);
  const askSide = ambiguity?.kind === 'side' || (NEEDS_SIDE.includes(relation) && side === undefined);
  if (askSide) {
    const chosen = SIDES.find((s) => s === decision.side);
    choices.push({ key: 'side', kind: 'side', options: [...SIDES], ...(chosen !== undefined && { value: chosen }) });
    side = chosen;
  }
  if (isGrandparent) {
    if (side === undefined && !askSide) side = relation.startsWith('maternal') ? 'maternal' : 'paternal';
    if (side !== undefined) {
      const kind = relation.endsWith('grandmother') ? 'grandmother' : 'grandfather';
      relation = `${side}_${kind}`;
    }
  }
  return { relation, ...(side !== undefined && { side }), choices, ...(code !== undefined && { condition: code }) };
}

const unanswered = (choices: Choice[]) => choices.some((choice) => choice.value === undefined);

/** Picks among existing people, or adds a new one. One existing match is the default. */
function pick(
  choices: Choice[],
  key: 'target' | 'via',
  candidates: PersonId[],
  answer: PersonId | 'new' | undefined,
  create: () => PersonId,
): { id: PersonId; isNew: boolean } | null {
  if (candidates.length > 0) {
    const options = [...candidates, 'new'];
    const valid = answer !== undefined && options.includes(answer) ? answer : undefined;
    const value = valid ?? (candidates.length === 1 ? candidates[0] : undefined);
    choices.push({ key, kind: key, options, ...(value !== undefined && { value }) });
    if (value === undefined) return null;
    if (value !== 'new') return { id: value, isNew: false };
  }
  return { id: create(), isNew: true };
}

function newPersonInput(entry: ProposedEntry, sex: Sex | undefined): NewPersonInput {
  return {
    ...(sex !== undefined && { sex }),
    ...(entry.displayName !== undefined && { displayName: entry.displayName }),
    ...(entry.deceased === true && { deceased: true }),
    ...(entry.ageAtDeath !== undefined && { ageAtDeath: entry.ageAtDeath }),
  };
}

/** Finds or adds the person the entry is about. Returns null while a choice is unanswered. */
function locate(work: Work, entry: ProposedEntry, relation: RelationKey, side: FamilySide | undefined, decision: Decision, choices: Choice[]): { id: PersonId; isNew: boolean } | null {
  const proband = work.ped.probandId;
  const sex = RELATION_SEX[relation] ?? entry.sex;
  const input = newPersonInput(entry, sex);
  const sideSex = side ? SIDE_SEX[side] : undefined;
  const filter = (ids: PersonId[]) => ids.filter((id) => matchesSex(work.ped, id, sex));

  switch (relation) {
    case 'self':
      return { id: proband, isNew: false };
    case 'mother':
    case 'father':
      return work.parent(proband, sex ?? 'unknown', false, input);
    case 'maternal_grandmother':
    case 'maternal_grandfather':
    case 'paternal_grandmother':
    case 'paternal_grandfather': {
      const parent = work.parent(proband, relation.startsWith('maternal') ? 'female' : 'male', true);
      return work.parent(parent.id, sex ?? 'unknown', false, input);
    }
    case 'sister':
    case 'brother':
      return pick(choices, 'target', filter(fullSiblings(work.ped, proband)), decision.target, () => {
        work.bothParents(proband);
        return work.created(addSibling(work.ped, proband, input, { type: 'full' }), false);
      });
    case 'half_sister':
    case 'half_brother': {
      if (!sideSex) return null;
      const shared = work.parent(proband, sideSex, true);
      return pick(choices, 'target', filter(halfSiblingsThrough(work.ped, proband, shared.id)), decision.target, () =>
        work.created(addSibling(work.ped, proband, input, { type: 'half', sharedParentId: shared.id }), false),
      );
    }
    case 'daughter':
    case 'son':
      return pick(choices, 'target', filter(bioChildren(work.ped, proband)), decision.target, () =>
        work.created(addChild(work.ped, proband, input), false),
      );
    case 'partner':
      return pick(choices, 'target', filter(partnersOf(work.ped, proband)), decision.target, () =>
        work.created(addPartner(work.ped, proband, input), false),
      );
    case 'aunt':
    case 'uncle': {
      if (!sideSex) return null;
      const parent = work.parent(proband, sideSex, true);
      return pick(choices, 'target', filter(fullSiblings(work.ped, parent.id)), decision.target, () => {
        work.bothParents(parent.id);
        return work.created(addSibling(work.ped, parent.id, input, { type: 'full' }), false);
      });
    }
    case 'niece':
    case 'nephew':
    case 'cousin':
    case 'grandchild': {
      // First whose child: a sibling, an aunt or uncle, or one of the user's children.
      let parentPool: PersonId[];
      let addParentOfTarget: () => PersonId;
      if (relation === 'cousin') {
        if (!sideSex) return null;
        const parent = work.parent(proband, sideSex, true);
        parentPool = fullSiblings(work.ped, parent.id);
        addParentOfTarget = () => {
          work.bothParents(parent.id);
          return work.created(addSibling(work.ped, parent.id, PLACEHOLDER, { type: 'full' }), true);
        };
      } else if (relation === 'grandchild') {
        parentPool = bioChildren(work.ped, proband);
        addParentOfTarget = () => work.created(addChild(work.ped, proband, PLACEHOLDER), true);
      } else {
        parentPool = fullSiblings(work.ped, proband);
        addParentOfTarget = () => {
          work.bothParents(proband);
          return work.created(addSibling(work.ped, proband, PLACEHOLDER, { type: 'full' }), true);
        };
      }
      const via = pick(choices, 'via', parentPool, decision.via, addParentOfTarget);
      if (!via) return null;
      const candidates = via.isNew ? [] : filter(bioChildren(work.ped, via.id));
      return pick(choices, 'target', candidates, decision.target, () =>
        work.created(addChild(work.ped, via.id, input), false),
      );
    }
  }
}

function describeCondition(condition: { ageAtOnset?: number; ageUnknown: boolean }): string {
  if (condition.ageAtOnset !== undefined) return t('quick.age.at', { age: condition.ageAtOnset });
  return condition.ageUnknown ? t('quick.age.unknown') : t('quick.age.notGiven');
}

const issueKeys = (ped: Pedigree) =>
  new Set(validatePedigree(ped).filter((i) => i.severity === 'error').map((i) => `${i.code}|${i.personIds.join(',')}`));

/** Works out one entry against the tree. Returns the tree after it, or the same tree when it cannot be applied. */
export function planEntry(ped: Pedigree, entry: ProposedEntry, decision: Decision = {}): { preview: Preview; pedigree: Pedigree } {
  const { relation, side, choices, condition: chosenCode } = effective(entry, decision);
  const base: Preview = {
    entryId: entry.id,
    status: 'needs_choice',
    relation,
    ...(side !== undefined && { side }),
    targetId: null,
    targetIsNew: false,
    placeholders: [],
    added: [],
    duplicates: [],
    filled: [],
    markDeceased: false,
    choices,
  };
  if (unanswered(choices)) return { preview: base, pedigree: ped };

  const work = new Work(ped);
  try {
    const target = locate(work, entry, relation, side, decision, choices);
    if (!target || unanswered(choices)) return { preview: { ...base, choices }, pedigree: ped };
    const preview: Preview = { ...base, targetId: target.id, targetIsNew: target.isNew, choices };
    const conflictChoice = (key: string, subject: string, recorded: string, proposed: string) => {
      const answer = decision.conflicts?.[key];
      const conflict: Conflict = { key, personId: target.id, subject, recorded, proposed };
      choices.push({ key, kind: 'conflict', options: ['keep', 'replace'], ...(answer !== undefined && { value: answer }), conflict });
      return answer;
    };

    const person = () => {
      const found = work.ped.persons[target.id];
      if (!found) throw new Refusal(t('quick.problem.generic'));
      return found;
    };
    // Fill in what is missing on someone already recorded; never replace without asking.
    if (!target.isNew) {
      const wanted = RELATION_SEX[relation] ?? entry.sex;
      if (wanted !== undefined && wanted !== 'unknown' && person().sex === 'unknown') {
        work.run(updatePerson(work.ped, target.id, { sex: wanted }));
      }
      if (entry.displayName !== undefined && person().displayName === undefined) {
        work.run(updatePerson(work.ped, target.id, { displayName: entry.displayName }));
      }
      if (entry.deceased === true && relation !== 'self') {
        const current = person();
        const recordedLiving = !current.deceased && current.vitalStatusUnknown !== true && current.ageNow !== undefined;
        if (current.deceased) {
          if (entry.ageAtDeath !== undefined && current.ageAtDeath === undefined) {
            work.run(updatePerson(work.ped, target.id, { ageAtDeath: entry.ageAtDeath }));
          } else if (entry.ageAtDeath !== undefined && current.ageAtDeath !== entry.ageAtDeath) {
            const answer = conflictChoice('conflict:vital', 'vital', t('quick.vital.diedAt', { age: current.ageAtDeath ?? '' }), t('quick.vital.diedAt', { age: entry.ageAtDeath }));
            if (answer === 'replace') work.run(updatePerson(work.ped, target.id, { ageAtDeath: entry.ageAtDeath }));
          }
        } else {
          const apply = () => {
            work.run(updatePerson(work.ped, target.id, {
              deceased: true,
              vitalStatusUnknown: null,
              ageNow: null,
              ...(entry.ageAtDeath !== undefined && { ageAtDeath: entry.ageAtDeath }),
            }));
            preview.markDeceased = true;
          };
          if (!recordedLiving) apply();
          else if (conflictChoice('conflict:vital', 'vital', t('quick.vital.living', { age: current.ageNow ?? '' }), t('quick.vital.deceased')) === 'replace') apply();
        }
      }
    } else if (entry.deceased === true) {
      preview.markDeceased = true;
    }

    // Conditions. A stand-in code is replaced by the user's choice.
    const proposed = entry.conditions.map((c, index) => (index === 0 && chosenCode !== undefined ? { ...c, code: chosenCode } : c));
    for (const condition of proposed) {
      const existing = person().conditions.find((c) => c.code === condition.code);
      const input = {
        code: condition.code,
        confirmed: condition.certainty,
        ageUnknown: condition.ageUnknown,
        ...(condition.ageAtOnset !== undefined && { ageAtOnset: condition.ageAtOnset }),
        ...(condition.subtype !== undefined && { subtype: condition.subtype }),
      };
      if (!existing) {
        work.run(setCondition(work.ped, target.id, input));
        preview.added.push(condition);
      } else if (condition.ageAtOnset === undefined || condition.ageAtOnset === existing.ageAtOnset) {
        preview.duplicates.push(condition);
      } else if (existing.ageAtOnset === undefined) {
        work.run(setCondition(work.ped, target.id, { ...input, id: existing.id, confirmed: existing.confirmed }));
        preview.filled.push(condition);
      } else {
        const nameKey: MessageKey = `cond.name.${condition.code}`;
        const name = t(nameKey);
        const answer = conflictChoice(`conflict:${condition.code}`, name, describeCondition(existing), describeCondition(condition));
        if (answer === 'replace') {
          work.run(setCondition(work.ped, target.id, { ...input, id: existing.id }));
          preview.filled.push(condition);
        } else if (answer === 'keep') {
          preview.duplicates.push(condition);
        }
      }
      // A fuzzy age is kept as the user's own words, in the person's notes.
      if (condition.ageNote !== undefined) {
        const noteKey: MessageKey = `cond.name.${condition.code}`;
        const note = t('quick.ageNote', { condition: t(noteKey), words: condition.ageNote });
        const notes = person().notes;
        const next = notes ? `${notes}\n${note}` : note;
        if (!notes?.includes(note) && next.length <= LIMITS.maxNotesLength) {
          work.run(updatePerson(work.ped, target.id, { notes: next }));
        }
      }
    }
    preview.placeholders = work.placeholders;
    if (unanswered(choices)) return { preview: { ...preview, status: 'needs_choice' }, pedigree: ped };

    // The same checks the person drawer applies: nothing that adds a contradiction is saved.
    const before = issueKeys(ped);
    const added = validatePedigree(work.ped).find((i) => i.severity === 'error' && !before.has(`${i.code}|${i.personIds.join(',')}`));
    if (added) return { preview: { ...preview, status: 'refused', problem: added.message }, pedigree: ped };

    const changed = work.ped !== ped;
    return { preview: { ...preview, status: changed ? 'ready' : 'nothing_new' }, pedigree: work.ped };
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { preview: { ...base, status: 'refused', problem: error.message }, pedigree: ped };
  }
}

/**
 * Works out every entry in order against the tree as the ones before it
 * leave it. The returned tree has every ready entry applied; it is what
 * "Accept all" saves, as one undo step.
 */
export function resolveEntries(
  ped: Pedigree,
  entries: readonly ProposedEntry[],
  decisions: Readonly<Record<string, Decision>> = {},
): Resolution {
  let current = ped;
  const previews: Preview[] = [];
  for (const entry of entries) {
    const { preview, pedigree } = planEntry(current, entry, decisions[entry.id] ?? {});
    previews.push(preview);
    if (preview.status === 'ready') current = pedigree;
  }
  return { previews, pedigree: current };
}
