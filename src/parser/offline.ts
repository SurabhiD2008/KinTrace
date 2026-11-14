import type { Sex } from '../domain/types';
import { en } from './lexicon/en';
import type { BaseRelation, Lexicon } from './lexicon/en';
import { MAX_INPUT_LENGTH, MAX_PARSE_ITEMS as MAX_LIST } from './types';
import type {
  FamilySide,
  ParseResult,
  ProposedCondition,
  ProposedEntry,
  RelationKey,
  Unparsed,
  UnparsedReason,
} from './types';

// Deterministic, offline, English-first. It only proposes: every entry is
// shown to the user, who accepts or rejects it. Nothing here invents data:
// a fuzzy age stays unknown, a hedge stays unsure, an unclear choice is
// handed back as a question, and text it cannot place is returned as is.

interface Token {
  w: string;
  start: number;
  end: number;
  /** Written with a possessive 's: "mum's", "40's". */
  poss: boolean;
}

/** A relation as worked out from a possessive chain, before it becomes a RelationKey. */
type KinRel =
  | RelationKey
  | 'grandmother'
  | 'grandfather'
  | 'grandparent'
  | 'parent'
  | 'sibling'
  | 'child'
  | 'niece_nephew'
  | 'aunt_uncle';

interface Kin {
  rel: KinRel;
  side?: FamilySide;
  sex?: Sex;
}

type Item =
  | { kind: 'subject'; from: number; to: number; kins: Kin[] }
  | { kind: 'unresolved'; from: number; to: number }
  | { kind: 'cond'; from: number; to: number; code: ProposedCondition['code']; subtype?: string }
  | { kind: 'generic'; from: number; to: number }
  | { kind: 'age'; from: number; to: number; value?: number; note?: string }
  | { kind: 'death' | 'neg' | 'nobody' | 'hedge' | 'choice' | 'or' | 'conj' | 'step' | 'instruction'; from: number; to: number };

const SUBJECT_KINDS = new Set(['subject', 'unresolved']);
const LEADING_KINDS = new Set(['hedge', 'neg', 'choice']);

function tokenize(text: string, offset: number): Token[] {
  const tokens: Token[] = [];
  const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
  for (const match of text.matchAll(pattern)) {
    let w = match[0].toLowerCase().replace(/’/g, "'");
    let poss = false;
    if (w.endsWith("'s")) {
      w = w.slice(0, -2);
      poss = true;
    }
    tokens.push({ w, start: offset + match.index, end: offset + match.index + match[0].length, poss });
  }
  return tokens;
}

/** Edit distance of at most one, counting a swap of two neighbours as one edit. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    const [i, j] = diff;
    return diff.length === 2 && i !== undefined && j === i + 1 && a[i] === b[j] && a[j] === b[i];
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i += 1;
  return short.slice(i) === long.slice(i + 1);
}

const FUZZY_MIN_LENGTH = 6;

/** Length of `phrase` at token i, or 0. A typo is forgiven only in a single long word. */
function phraseAt(tokens: Token[], i: number, phrase: readonly string[], fuzzy = false): number {
  for (let k = 0; k < phrase.length; k += 1) {
    const token = tokens[i + k];
    const word = phrase[k];
    if (!token || word === undefined) return 0;
    // A possessive may only end the phrase ("mother's" in "mother's side").
    if (token.poss && k < phrase.length - 1) return 0;
    const exact = token.w === word;
    const forgiven =
      fuzzy && phrase.length === 1 && word.length >= FUZZY_MIN_LENGTH && token.w.length >= FUZZY_MIN_LENGTH && withinOneEdit(token.w, word);
    if (!exact && !forgiven) return 0;
  }
  return phrase.length;
}

function firstPhrase<T extends { phrase: readonly string[] }>(
  tokens: Token[],
  i: number,
  list: readonly T[],
  fuzzy = false,
): { entry: T; length: number } | null {
  // An exact match always beats a forgiven typo ("parents" is not a typo of "parent").
  for (const allowTypo of fuzzy ? [false, true] : [false]) {
    let best: { entry: T; length: number } | null = null;
    for (const entry of list) {
      const length = phraseAt(tokens, i, entry.phrase, allowTypo);
      if (length > 0 && (!best || length > best.length)) best = { entry, length };
    }
    if (best) return best;
  }
  return null;
}

function anyPhrase(tokens: Token[], i: number, list: readonly (readonly string[])[]): number {
  let best = 0;
  for (const phrase of list) best = Math.max(best, phraseAt(tokens, i, phrase));
  return best;
}

/** A whole number from digits or English number words, with how many tokens it used. */
function numberAt(lex: Lexicon, tokens: Token[], i: number): { value: number; length: number } | null {
  const token = tokens[i];
  if (!token) return null;
  if (/^\d{1,3}$/.test(token.w) && !token.poss) return { value: Number(token.w), length: 1 };
  const tens = lex.tensWords[token.w];
  if (tens !== undefined) {
    const next = tokens[i + 1];
    const unit = next ? lex.numberWords[next.w] : undefined;
    if (!token.poss && unit !== undefined && unit > 0 && unit < 10) return { value: tens + unit, length: 2 };
    return { value: tens, length: 1 };
  }
  const small = lex.numberWords[token.w];
  return small === undefined ? null : { value: small, length: 1 };
}

const MAX_AGE = 120;

/** "at 38", "aged fifty-two", "when she was 44", or a decade such as "in her forties", "late 30s". */
function ageAt(lex: Lexicon, tokens: Token[], i: number, text: string): Item | null {
  const intro = anyPhrase(tokens, i, lex.ageIntros);
  if (intro > 0) {
    const number = numberAt(lex, tokens, i + intro);
    const after = tokens[i + intro + (number?.length ?? 0)];
    // "at 40s" is a decade, handled below.
    const fromWord = !/^\d/.test(tokens[i + intro]?.w ?? '');
    if (number && number.value <= MAX_AGE && !(fromWord && number.value < 10) && !(after && after.w === 's')) {
      return { kind: 'age', from: i, to: i + intro + number.length, value: number.value };
    }
  }
  const when = tokens[i];
  const pronoun = tokens[i + 1];
  const verb = tokens[i + 2];
  if (when?.w === 'when' && pronoun && lex.whenPronouns.includes(pronoun.w) && (verb?.w === 'was' || verb?.w === 'were')) {
    const number = numberAt(lex, tokens, i + 3);
    if (number && number.value <= MAX_AGE) return { kind: 'age', from: i, to: i + 3 + number.length, value: number.value };
  }
  // Decades. The words are kept as a note; the age itself stays unknown.
  let j = i + anyPhrase(tokens, i, lex.decadeIntros);
  if (tokens[j] && lex.decadeQualifiers.includes(tokens[j]?.w ?? '')) j += 1;
  const word = tokens[j];
  if (word) {
    const isDecadeWord = lex.decadeWords[word.w] !== undefined;
    const isDecadeNumber = /^[1-9]0s$/.test(word.w) || (/^[1-9]0$/.test(word.w) && word.poss);
    if (isDecadeWord || isDecadeNumber) {
      const start = tokens[i]?.start ?? 0;
      return { kind: 'age', from: i, to: j + 1, note: text.slice(start, word.end) };
    }
  }
  return null;
}

/** Side of the family a parent word stands for: mother's side is maternal. */
function sideOfBase(base: BaseRelation): FamilySide | undefined {
  if (base === 'mother' || base === 'grandmother') return 'maternal';
  if (base === 'father' || base === 'grandfather') return 'paternal';
  return undefined;
}

function sideOfKin(kin: Kin): FamilySide | undefined {
  if (kin.rel === 'mother') return 'maternal';
  if (kin.rel === 'father') return 'paternal';
  return kin.side;
}

/** One step along a possessive chain: "my mum's" + "sister" is a maternal aunt. */
function compose(anchor: Kin, base: BaseRelation, sex: Sex | undefined, side: FamilySide | undefined): Kin[] | null {
  const withSex = (kin: Kin): Kin => (sex !== undefined && kin.sex === undefined ? { ...kin, sex } : kin);
  if (anchor.rel === 'self') {
    switch (base) {
      case 'self':
        return [{ rel: 'self' }];
      case 'parents':
        return [{ rel: 'mother', sex: 'female' }, { rel: 'father', sex: 'male' }];
      case 'grandparents':
        return [withSide({ rel: 'grandmother', sex: 'female' }, side), withSide({ rel: 'grandfather', sex: 'male' }, side)];
      case 'grandmother':
      case 'grandfather':
      case 'aunt':
      case 'uncle':
      case 'cousin':
      case 'half_sister':
      case 'half_brother':
        return [withSex(withSide({ rel: base }, side))];
      default:
        return [withSex({ rel: base })];
    }
  }
  const parentSide = sideOfKin(anchor);
  if (anchor.rel === 'mother' || anchor.rel === 'father') {
    const map: Partial<Record<BaseRelation, KinRel>> = {
      mother: 'grandmother',
      father: 'grandfather',
      parent: 'grandparent',
      sister: 'aunt',
      brother: 'uncle',
      sibling: 'aunt_uncle',
      daughter: 'sister',
      son: 'brother',
      child: 'sibling',
    };
    const rel = map[base];
    if (rel === undefined) return null;
    const needsSide = rel === 'grandmother' || rel === 'grandfather' || rel === 'grandparent' || rel === 'aunt' || rel === 'uncle' || rel === 'aunt_uncle';
    return [withSex(needsSide ? withSide({ rel }, parentSide) : { rel })];
  }
  if (anchor.rel === 'sister' || anchor.rel === 'brother' || anchor.rel === 'sibling' || anchor.rel === 'half_sister' || anchor.rel === 'half_brother') {
    const map: Partial<Record<BaseRelation, KinRel>> = {
      son: 'nephew',
      daughter: 'niece',
      child: 'niece_nephew',
    };
    const rel = map[base];
    if (rel !== undefined) return [withSex({ rel })];
    if (base === 'mother' || base === 'father') return [withSex({ rel: base })];
    return null;
  }
  if (anchor.rel === 'aunt' || anchor.rel === 'uncle' || anchor.rel === 'aunt_uncle') {
    if (base === 'son' || base === 'daughter' || base === 'child') return [withSex(withSide({ rel: 'cousin' }, anchor.side))];
    return null;
  }
  if (anchor.rel === 'son' || anchor.rel === 'daughter' || anchor.rel === 'child') {
    if (base === 'son' || base === 'daughter' || base === 'child') return [withSex({ rel: 'grandchild' })];
    return null;
  }
  return null;
}

function withSide(kin: Kin, side: FamilySide | undefined): Kin {
  return side === undefined ? kin : { ...kin, side };
}

/** Turns a worked-out relation into the shared contract's fields, asking where it is unclear. */
function toEntryFields(kin: Kin): Pick<ProposedEntry, 'relation'> & Partial<Pick<ProposedEntry, 'side' | 'sex' | 'ambiguity'>> {
  const side = kin.side;
  const sex = kin.sex !== undefined ? { sex: kin.sex } : {};
  const withKnownSide = side !== undefined ? { side } : {};
  const askSide = side === undefined ? { ambiguity: { kind: 'side' as const, options: ['maternal', 'paternal'] } } : {};
  switch (kin.rel) {
    case 'grandmother':
    case 'grandfather': {
      const relation: RelationKey = `${side ?? 'maternal'}_${kin.rel}`;
      return { relation, ...sex, ...withKnownSide, ...askSide };
    }
    case 'grandparent': {
      const sides: FamilySide[] = side ? [side] : ['maternal', 'paternal'];
      const options = sides.flatMap((s) => [`${s}_grandmother`, `${s}_grandfather`]);
      return { relation: `${sides[0] ?? 'maternal'}_grandmother`, ...withKnownSide, ambiguity: { kind: 'relation', options } };
    }
    case 'parent':
      return { relation: 'mother', ambiguity: { kind: 'relation', options: ['mother', 'father'] } };
    case 'sibling':
      return { relation: 'sister', ambiguity: { kind: 'relation', options: ['sister', 'brother'] } };
    case 'child':
      return { relation: 'daughter', ambiguity: { kind: 'relation', options: ['daughter', 'son'] } };
    case 'niece_nephew':
      return { relation: 'niece', ambiguity: { kind: 'relation', options: ['niece', 'nephew'] } };
    case 'aunt_uncle':
      return { relation: 'aunt', ...withKnownSide, ambiguity: { kind: 'relation', options: ['aunt', 'uncle'] } };
    case 'aunt':
    case 'uncle':
    case 'cousin':
    case 'half_sister':
    case 'half_brother':
      return { relation: kin.rel, ...sex, ...withKnownSide, ...askSide };
    default:
      return { relation: kin.rel, ...sex };
  }
}

interface ClauseState {
  /** The people the last subject named, for "her", "his", "she". */
  previous: Kin[] | null;
}

/** Reads a mention such as "my mum's sister", "her late husband" or "Dad". */
function mentionAt(
  lex: Lexicon,
  tokens: Token[],
  i: number,
  state: ClauseState,
): { item: Item; length: number; late: boolean } | null {
  let j = i;
  const possessive = lex.possessives.find((p) => p.word === tokens[j]?.w && !tokens[j]?.poss);
  if (possessive) j += 1;
  // "my late father": the death word is read by the caller; the mention skips it.
  const late = possessive !== undefined && tokens[j]?.w === lex.lateWord;
  if (late) j += 1;
  let side: FamilySide | undefined;
  const sideWord = firstPhrase(tokens, j, lex.sideWords);
  if (sideWord) {
    side = sideWord.entry.side;
    j += sideWord.length;
  }
  const first = firstPhrase(tokens, j, lex.relations, true);
  if (!first) return null;

  let anchors: Kin[] | null = possessive?.anchor === 'previous' ? state.previous : [{ rel: 'self' }];
  if (anchors === null || anchors.length !== 1) {
    // "her sister" with no one before it to belong to.
    return { item: { kind: 'unresolved', from: i, to: j + first.length }, length: j + first.length - i, late };
  }
  let current: Kin[] | null = compose(anchors[0] as Kin, first.entry.base, first.entry.sex, side);
  j += first.length;
  // Follow the chain while the last word was possessive: "mum's sister's daughter".
  while (current && current.length === 1 && tokens[j - 1]?.poss) {
    if (tokens[j]?.w === lex.sideNoun[0]) break;
    let stepSide: FamilySide | undefined;
    const sideStep = firstPhrase(tokens, j, lex.sideWords);
    if (sideStep) {
      stepSide = sideStep.entry.side;
      j += sideStep.length;
    }
    const next = firstPhrase(tokens, j, lex.relations, true);
    if (!next) break;
    current = compose(current[0] as Kin, next.entry.base, next.entry.sex, stepSide);
    j += next.length;
  }
  anchors = current;
  if (anchors === null) return { item: { kind: 'unresolved', from: i, to: j }, length: j - i, late };
  return { item: { kind: 'subject', from: i, to: j, kins: anchors }, length: j - i, late };
}

/** "on my mum's side", "maternal side": which side of the family the clause is about. */
function sidePhraseAt(lex: Lexicon, tokens: Token[], i: number): { side: FamilySide; length: number } | null {
  let j = i;
  if (tokens[j]?.w === 'on') j += 1;
  if (lex.possessives.some((p) => p.word === tokens[j]?.w)) j += 1;
  const sideWord = firstPhrase(tokens, j, lex.sideWords);
  if (sideWord && tokens[j + sideWord.length]?.w === lex.sideNoun[0]) {
    return { side: sideWord.entry.side, length: j + sideWord.length + 1 - i };
  }
  const relation = firstPhrase(tokens, j, lex.relations);
  const relToken = tokens[j + (relation?.length ?? 0) - 1];
  if (relation && relToken?.poss && tokens[j + relation.length]?.w === lex.sideNoun[0]) {
    const side = sideOfBase(relation.entry.base);
    if (side) return { side, length: j + relation.length + 1 - i };
  }
  return null;
}

/** Turns one clause into items, in reading order. */
function readClause(lex: Lexicon, tokens: Token[], text: string, state: ClauseState): { items: Item[]; side?: FamilySide } {
  const items: Item[] = [];
  let side: FamilySide | undefined;
  let i = 0;
  const push = (item: Item) => {
    items.push(item);
    i = item.to;
  };
  while (i < tokens.length) {
    const token = tokens[i] as Token;
    let length = anyPhrase(tokens, i, lex.instructionWords);
    if (length > 0) {
      push({ kind: 'instruction', from: i, to: i + length });
      continue;
    }
    const isStepWord = token.w !== 'step' && lex.stepWords.some((phrase) => phrase[0] === token.w);
    if (isStepWord || (token.w === 'step' && firstPhrase(tokens, i + 1, lex.relations))) {
      push({ kind: 'step', from: i, to: i + 1 });
      continue;
    }
    if ((length = anyPhrase(tokens, i, lex.choiceMarkers)) > 0) {
      push({ kind: 'choice', from: i, to: i + length });
      continue;
    }
    if ((length = anyPhrase(tokens, i, lex.hedges)) > 0) {
      push({ kind: 'hedge', from: i, to: i + length });
      continue;
    }
    if ((length = anyPhrase(tokens, i, lex.nobody)) > 0) {
      push({ kind: 'nobody', from: i, to: i + length });
      continue;
    }
    const sidePhrase = sidePhraseAt(lex, tokens, i);
    if (sidePhrase) {
      side = sidePhrase.side;
      i += sidePhrase.length;
      continue;
    }
    const age = ageAt(lex, tokens, i, text);
    if (age) {
      push(age);
      continue;
    }
    if (token.w === lex.lateWord && firstPhrase(tokens, i + 1, lex.relations)) {
      // "late father": the death word sits right before a family word.
      push({ kind: 'death', from: i, to: i + 1 });
      continue;
    }
    if ((length = anyPhrase(tokens, i, lex.negations)) > 0) {
      push({ kind: 'neg', from: i, to: i + length });
      continue;
    }
    if ((length = anyPhrase(tokens, i, lex.deathWords)) > 0) {
      push({ kind: 'death', from: i, to: i + length });
      continue;
    }
    const condition = firstPhrase(tokens, i, lex.conditions, true);
    if (condition) {
      push({
        kind: 'cond',
        from: i,
        to: i + condition.length,
        code: condition.entry.code,
        ...(condition.entry.subtype !== undefined && { subtype: condition.entry.subtype }),
      });
      continue;
    }
    if ((length = anyPhrase(tokens, i, lex.genericConditions)) > 0) {
      push({ kind: 'generic', from: i, to: i + length });
      continue;
    }
    if (lex.orWords.includes(token.w)) {
      push({ kind: 'or', from: i, to: i + 1 });
      continue;
    }
    const mention = mentionAt(lex, tokens, i, state);
    if (mention) {
      push(mention.item);
      if (mention.late) items.push({ kind: 'death', from: mention.item.from, to: mention.item.from + 1 });
      if (mention.item.kind === 'subject') state.previous = mention.item.kins;
      continue;
    }
    if (lex.selfWords.includes(token.w) && (token.w === 'myself' || lex.selfVerbs.includes(tokens[i + 1]?.w ?? '') || token.w === "i've")) {
      const kins: Kin[] = [{ rel: 'self' }];
      push({ kind: 'subject', from: i, to: i + 1, kins });
      state.previous = kins;
      continue;
    }
    if (lex.subjectPronouns.includes(token.w) && state.previous) {
      push({ kind: 'subject', from: i, to: i + 1, kins: state.previous });
      continue;
    }
    if (lex.conjunctions.includes(token.w)) {
      push({ kind: 'conj', from: i, to: i + 1 });
      continue;
    }
    i += 1;
  }
  return { items, ...(side !== undefined && { side }) };
}

interface Group {
  subjects: Item[];
  info: Item[];
}

/**
 * Gives every fact to a group of people. Names joined by "and" share what
 * follows them; a hedge or negation right before a name belongs to that name.
 */
function groupItems(items: Item[]): { groups: Group[]; orphans: Item[] } {
  const groups: Group[] = [];
  const orphans: Item[] = [];
  const pendingLead: Item[] = [];
  let current: Group | null = null;
  let lastWasSubject = false;
  for (const item of items) {
    if (SUBJECT_KINDS.has(item.kind)) {
      if (!(current && lastWasSubject)) {
        current = { subjects: [], info: [...pendingLead] };
        groups.push(current);
        pendingLead.length = 0;
      }
      current.subjects.push(item);
      lastWasSubject = true;
      continue;
    }
    if (item.kind === 'conj') continue;
    if (LEADING_KINDS.has(item.kind) && (current === null || !lastWasSubject)) {
      // Held back: it belongs to the next name if one follows straight after.
      pendingLead.push(item);
      lastWasSubject = false;
      continue;
    }
    lastWasSubject = false;
    const lead = pendingLead.splice(0);
    if (current) current.info.push(...lead, item);
    else orphans.push(...lead, item);
  }
  if (pendingLead.length > 0) {
    if (current) current.info.push(...pendingLead);
    else orphans.push(...pendingLead);
  }
  return { groups, orphans };
}

interface GroupFacts {
  conditions: ProposedCondition[];
  choice: string[] | null;
  deceased: boolean;
  ageAtDeath?: number;
  generic: boolean;
  negated: boolean;
}

function factsOf(group: Group): GroupFacts {
  const info = [...group.info].sort((a, b) => a.from - b.from);
  const hedged = info.some((item) => item.kind === 'hedge' || item.kind === 'choice');
  const certainty: ProposedCondition['certainty'] = hedged ? 'unsure' : 'reported';
  // Facts that a negation before them takes away.
  const firstNeg = info.find((item) => item.kind === 'neg');
  const negatedAfter = firstNeg ? firstNeg.from : Infinity;

  type Slot = { item: Item; condition?: ProposedCondition; isDeath?: boolean; age?: Item };
  const slots: Slot[] = [];
  let generic = false;
  let deceased = false;
  for (const item of info) {
    if (item.kind === 'cond' && item.from > negatedAfter) continue;
    if (item.kind === 'generic' && item.from > negatedAfter) continue;
    if (item.kind === 'cond') {
      slots.push({
        item,
        condition: {
          code: item.code,
          ageUnknown: false,
          certainty,
          ...(item.subtype !== undefined && { subtype: item.subtype }),
        },
      });
    } else if (item.kind === 'death') {
      deceased = true;
      slots.push({ item, isDeath: true });
    } else if (item.kind === 'generic') {
      generic = true;
    }
  }
  // Each age goes to the nearest condition or death before it; failing that, the one after.
  for (const age of info.filter((item) => item.kind === 'age')) {
    const before = [...slots].reverse().find((slot) => slot.item.from < age.from && !slot.age);
    const after = slots.find((slot) => slot.item.from > age.from && !slot.age);
    const slot = before ?? after;
    if (slot) slot.age = age;
  }
  let ageAtDeath: number | undefined;
  const conditions: ProposedCondition[] = [];
  const conditionOf = new Map<Slot, ProposedCondition>();
  for (const slot of slots) {
    const age = slot.age?.kind === 'age' ? slot.age : undefined;
    if (slot.isDeath) {
      if (age?.value !== undefined) ageAtDeath = age.value;
      continue;
    }
    if (!slot.condition) continue;
    let condition = slot.condition;
    if (age?.value !== undefined) condition = { ...condition, ageAtOnset: age.value };
    else if (age?.note !== undefined) condition = { ...condition, ageUnknown: true, ageNote: age.note.slice(0, 60) };
    conditions.push(condition);
    conditionOf.set(slot, condition);
  }

  // "breast or ovarian": two conditions joined by "or" become one question.
  let choice: string[] | null = null;
  const orItem = info.find((item) => item.kind === 'or');
  if (orItem && conditions.length >= 2) {
    const condSlots = slots.filter((slot) => conditionOf.has(slot));
    const leftSlot = [...condSlots].reverse().find((slot) => slot.item.from < orItem.from);
    const rightSlot = condSlots.find((slot) => slot.item.from > orItem.from);
    const leftCondition = leftSlot ? conditionOf.get(leftSlot) : undefined;
    const rightCondition = rightSlot ? conditionOf.get(rightSlot) : undefined;
    if (leftCondition && rightCondition && leftCondition.code !== rightCondition.code) {
      choice = [leftCondition.code, rightCondition.code];
      const pair = [leftCondition, rightCondition];
      const age = pair.find((c) => c.ageAtOnset !== undefined || c.ageUnknown);
      const merged: ProposedCondition = {
        ...leftCondition,
        ageUnknown: false,
        certainty,
        ...(age?.ageAtOnset !== undefined && { ageAtOnset: age.ageAtOnset }),
        ...(age?.ageUnknown === true && { ageUnknown: true, ...(age.ageNote !== undefined && { ageNote: age.ageNote }) }),
      };
      const rest = conditions.filter((c) => !pair.includes(c));
      conditions.length = 0;
      conditions.push(merged, ...rest);
    }
  }
  return {
    conditions,
    choice,
    deceased,
    ...(ageAtDeath !== undefined && { ageAtDeath }),
    generic,
    negated: firstNeg !== undefined,
  };
}

function looksForeign(lex: Lexicon, tokens: Token[], text: string): boolean {
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\s]/u.test(text.replace(/\p{Extended_Pictographic}/gu, ''))) return true;
  const words = tokens.filter((token) => /\p{L}/u.test(token.w));
  if (words.length < 2) return false;
  return !words.some((token) => lex.stopwords.includes(token.w));
}

/** Splits text into sentence-like clauses with their positions in the text. */
function clauses(text: string): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = [];
  const pattern = /[^.!?;\n]+/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    result.push({ start: match.index + lead, end: match.index + lead + trimmed.length });
  }
  return result;
}

export interface OfflineOptions {
  lexicon?: Lexicon;
}

export function parseOffline(text: string, options: OfflineOptions = {}): ParseResult {
  const lex = options.lexicon ?? en;
  if (text.length > MAX_INPUT_LENGTH) {
    return { entries: [], unparsed: [{ text: '', reason: 'too_long' }], engine: 'offline' };
  }
  const entries: ProposedEntry[] = [];
  const unparsed: Unparsed[] = [];
  const state: ClauseState = { previous: null };
  const skip = (start: number, end: number, reason: UnparsedReason) => {
    unparsed.push({ text: text.slice(start, end), reason });
  };

  for (const clause of clauses(text)) {
    const slice = text.slice(clause.start, clause.end);
    const tokens = tokenize(slice, clause.start);
    if (tokens.length === 0) continue;
    const { items, side: clauseSide } = readClause(lex, tokens, text, state);

    // Text that reads like an instruction is just text: it is handed back, never acted on.
    if (items.some((item) => item.kind === 'instruction')) {
      skip(clause.start, clause.end, 'instruction');
      continue;
    }
    if (items.some((item) => item.kind === 'step')) {
      skip(clause.start, clause.end, 'step_relative');
      continue;
    }
    // "No one in the family had…" says nothing to add.
    if (items.some((item) => item.kind === 'nobody')) continue;

    const { groups, orphans } = groupItems(items);
    const foreign = looksForeign(lex, tokens, slice);
    let produced = false;
    let reported = false;
    let understoodNegation = false;

    for (const [index, group] of groups.entries()) {
      const nextGroup = groups[index + 1];
      const spanStart = tokens[Math.min(...[...group.subjects, ...group.info].map((item) => item.from))]?.start ?? clause.start;
      const lastTo = Math.max(...[...group.subjects, ...group.info].map((item) => item.to));
      const spanEnd = nextGroup
        ? (tokens[Math.max(lastTo - 1, 0)]?.end ?? clause.end)
        : clause.end;
      const facts = factsOf(group);

      if (group.subjects.some((subject) => subject.kind === 'unresolved')) {
        skip(spanStart, spanEnd, 'relation_unclear');
        reported = true;
        continue;
      }
      const saysNothing = facts.conditions.length === 0 && !facts.deceased && !facts.generic && !facts.negated;
      // A family word alone in text that is not English ("mama" in Spanish) is not a mention.
      if (saysNothing && foreign) continue;
      if (facts.negated && facts.conditions.length === 0 && !facts.deceased) {
        understoodNegation = true;
        continue;
      }
      if (facts.generic && facts.conditions.length === 0) {
        skip(spanStart, spanEnd, 'no_condition_type');
        reported = true;
        if (!facts.deceased) continue;
      }
      for (const subject of group.subjects) {
        if (subject.kind !== 'subject') continue;
        for (const kin of subject.kins) {
          const sided = kin.side === undefined && clauseSide !== undefined && needsSide(kin.rel) ? { ...kin, side: clauseSide } : kin;
          const fields = toEntryFields(sided);
          if (facts.choice && fields.ambiguity) {
            // Two questions at once cannot be asked in one entry; hand it back.
            skip(spanStart, spanEnd, 'relation_unclear');
            reported = true;
            continue;
          }
          const isSelf = fields.relation === 'self';
          const entry: ProposedEntry = {
            id: `e${entries.length + 1}`,
            ...fields,
            conditions: facts.conditions,
            ...(!isSelf && facts.deceased && { deceased: true }),
            ...(!isSelf && facts.ageAtDeath !== undefined && { ageAtDeath: facts.ageAtDeath }),
            sourceSpan: { start: spanStart, end: Math.max(spanEnd, spanStart) },
            ...(facts.choice && { ambiguity: { kind: 'condition' as const, options: facts.choice } }),
          };
          entries.push(entry);
          produced = true;
        }
      }
    }

    const orphanFacts = orphans.filter((item) => item.kind === 'cond' || item.kind === 'generic' || item.kind === 'death');
    if (orphanFacts.length > 0 && !orphans.some((item) => item.kind === 'neg')) {
      skip(clause.start, clause.end, 'no_person');
      continue;
    }
    if (orphans.some((item) => item.kind === 'neg')) understoodNegation = true;
    if (!produced && !reported && !understoodNegation && orphanFacts.length === 0) {
      skip(clause.start, clause.end, foreign ? 'language' : 'nothing_found');
    }
  }
  return withinContract(text, entries, unparsed);
}

/**
 * Keeps the result inside the shared contract (at most MAX_LIST entries and
 * unparsed pieces), which the AI path already enforces. What does not fit is
 * handed back as one "too long" piece, never dropped silently.
 */
function withinContract(text: string, entries: ProposedEntry[], unparsed: Unparsed[]): ParseResult {
  const kept = entries.slice(0, MAX_LIST);
  const leftover: string[] = [];
  const firstCut = entries[MAX_LIST];
  if (firstCut) leftover.push(text.slice(firstCut.sourceSpan.start));
  const notes = unparsed.length > MAX_LIST - 1 ? unparsed.slice(0, MAX_LIST - 1) : unparsed;
  leftover.push(...unparsed.slice(notes.length).map((piece) => piece.text));
  const rest = leftover.join(' ').slice(0, MAX_INPUT_LENGTH);
  return {
    entries: kept,
    unparsed: leftover.length > 0 ? [...notes, { text: rest, reason: 'too_long' }] : notes,
    engine: 'offline',
  };
}

function needsSide(rel: KinRel): boolean {
  return ['grandmother', 'grandfather', 'grandparent', 'aunt', 'uncle', 'aunt_uncle', 'cousin', 'half_sister', 'half_brother'].includes(rel);
}
