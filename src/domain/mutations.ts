import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { ancestorsOf, connectedTo, parentIdsOf } from './graph';
import { conditionSchema, idSchema, personSchema } from './schema';
import { CONDITION_CODES, DOMAIN_OF_CODE, LIMITS, PEDIGREE_VERSION } from './types';
import type {
  Condition,
  ConditionCode,
  ConditionDomain,
  Confirmation,
  Laterality,
  ParentLink,
  ParentLinkKind,
  PartnershipStatus,
  Pedigree,
  Person,
  PersonId,
  Sex,
} from './types';

// Every function here is pure: it returns a new Pedigree (sharing untouched
// parts with the old one) or a typed error. Nothing throws, nothing mutates.

export type MutationErrorCode =
  | 'person_not_found'
  | 'person_exists'
  | 'invalid_id'
  | 'limit_reached'
  | 'cannot_remove_proband'
  | 'would_disconnect'
  | 'too_many_biological_parents'
  | 'duplicate_link'
  | 'self_link'
  | 'would_create_cycle'
  | 'shared_parent_required'
  | 'duplicate_partnership'
  | 'self_partnership'
  | 'condition_not_found'
  | 'invalid_condition'
  | 'invalid_value';

export interface MutationError {
  code: MutationErrorCode;
  /** The people the refusal is about; for would_disconnect, those who would be cut off. */
  personIds: PersonId[];
  message: string;
}

export type MutationResult =
  | { ok: true; pedigree: Pedigree; createdId: string | null }
  | { ok: false; error: MutationError };

export interface NewPersonInput {
  /** Omit to get the next free id (p1, p2, ...). */
  id?: PersonId;
  displayName?: string;
  /** Defaults to 'unknown'. */
  sex?: Sex;
  birthYear?: number;
  ageNow?: number;
  /** Defaults to false. */
  deceased?: boolean;
  ageAtDeath?: number;
  notes?: string;
  vitalStatusUnknown?: boolean;
  healthHistoryUnknown?: boolean;
}

/** Either someone already in the pedigree, or the details of someone to add. */
export type PersonRef = NewPersonInput | { existingId: PersonId };

type ClearableField =
  | 'displayName'
  | 'birthYear'
  | 'ageNow'
  | 'ageAtDeath'
  | 'notes'
  | 'vitalStatusUnknown'
  | 'healthHistoryUnknown';

/** Fields to change. For optional fields, `null` clears the value. */
export type PersonPatch = { sex?: Sex; deceased?: boolean } & {
  [K in ClearableField]?: NonNullable<Person[K]> | null;
};

const PATCHABLE_FIELDS: ReadonlySet<string> = new Set<keyof PersonPatch>([
  'sex',
  'deceased',
  'displayName',
  'birthYear',
  'ageNow',
  'ageAtDeath',
  'notes',
  'vitalStatusUnknown',
  'healthHistoryUnknown',
]);

export interface ConditionInput {
  /** Give the id of an existing condition to replace it; omit to add a new one. */
  id?: string;
  code: ConditionCode;
  /** Defaults to the domain of the code; a mismatch is refused. */
  domain?: ConditionDomain;
  ageAtOnset?: number;
  /** Defaults to false. */
  ageUnknown?: boolean;
  subtype?: string;
  laterality?: Laterality;
  /** Defaults to 'reported'. */
  confirmed?: Confirmation;
}

function ok(pedigree: Pedigree, createdId: string | null = null): MutationResult {
  return { ok: true, pedigree, createdId };
}

function fail(code: MutationErrorCode, personIds: PersonId[] = []): MutationResult {
  const key: MessageKey = `mutation.${code}`;
  return { ok: false, error: { code, personIds, message: t(key) } };
}

/**
 * Why a person's values could not be stored, or null when they can. Every
 * mutation checks the person it produces against the same schema that loading
 * uses, so nothing saved can fail to load again after a reload.
 */
function personProblem(person: Person): MessageKey | null {
  return agesProblem([person.ageNow, person.ageAtDeath]) ?? (personSchema.safeParse(person).success ? null : 'mutation.invalid_value');
}

/** The specific message for an age that is not a whole number from 0 to 120. */
function agesProblem(values: readonly unknown[]): MessageKey | null {
  const ages = values.filter((value) => value !== undefined);
  if (ages.some((age) => typeof age !== 'number' || !Number.isInteger(age) || age < 0)) return 'validation.age_invalid';
  if (ages.some((age) => typeof age === 'number' && age > LIMITS.maxAge)) return 'validation.age_too_high';
  return null;
}

function invalidValue(key: MessageKey, personIds: PersonId[]): MutationResult {
  return { ok: false, error: { code: 'invalid_value', personIds, message: t(key) } };
}

function hasPerson(ped: Pedigree, id: PersonId): boolean {
  return Object.hasOwn(ped.persons, id);
}

/** Next free id with this prefix: one more than the highest number in use. */
function nextId(existing: Iterable<string>, prefix: string): string {
  let highest = 0;
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    if (/^\d+$/.test(rest)) highest = Math.max(highest, Number(rest));
  }
  return `${prefix}${highest + 1}`;
}

function buildPerson(id: PersonId, input: NewPersonInput): Person {
  return {
    id,
    sex: input.sex ?? 'unknown',
    deceased: input.deceased ?? false,
    conditions: [],
    ...(input.displayName !== undefined && { displayName: input.displayName }),
    ...(input.birthYear !== undefined && { birthYear: input.birthYear }),
    ...(input.ageNow !== undefined && { ageNow: input.ageNow }),
    ...(input.ageAtDeath !== undefined && { ageAtDeath: input.ageAtDeath }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.vitalStatusUnknown !== undefined && { vitalStatusUnknown: input.vitalStatusUnknown }),
    ...(input.healthHistoryUnknown !== undefined && {
      healthHistoryUnknown: input.healthHistoryUnknown,
    }),
  };
}

/** Starts a pedigree containing only the proband. */
export function createPedigree(proband: NewPersonInput = {}): Pedigree {
  const id = proband.id !== undefined && idSchema.safeParse(proband.id).success ? proband.id : 'p1';
  const person = buildPerson(id, proband);
  return {
    version: PEDIGREE_VERSION,
    // Values that could not be stored are dropped rather than saved and lost on reload.
    persons: { [id]: personProblem(person) === null ? person : buildPerson(id, {}) },
    parentLinks: [],
    partnerships: [],
    probandId: id,
  };
}

export function addPerson(ped: Pedigree, input: NewPersonInput = {}): MutationResult {
  const id = input.id ?? nextId(Object.keys(ped.persons), 'p');
  if (!idSchema.safeParse(id).success) return fail('invalid_id');
  if (hasPerson(ped, id)) return fail('person_exists', [id]);
  if (Object.keys(ped.persons).length >= LIMITS.maxPersons) return fail('limit_reached');
  const person = buildPerson(id, input);
  const problem = personProblem(person);
  if (problem !== null) return invalidValue(problem, [id]);
  return ok({ ...ped, persons: { ...ped.persons, [id]: person } }, id);
}

/** Uses the existing person, or adds the new one. */
function resolve(ped: Pedigree, ref: PersonRef): MutationResult {
  if ('existingId' in ref) {
    return hasPerson(ped, ref.existingId)
      ? ok(ped, ref.existingId)
      : fail('person_not_found', [ref.existingId]);
  }
  return addPerson(ped, ref);
}

function linkParent(
  ped: Pedigree,
  childId: PersonId,
  parentId: PersonId,
  kind: ParentLinkKind,
): MutationResult {
  if (!hasPerson(ped, childId)) return fail('person_not_found', [childId]);
  if (!hasPerson(ped, parentId)) return fail('person_not_found', [parentId]);
  if (childId === parentId) return fail('self_link', [childId]);
  if (ped.parentLinks.some((link) => link.childId === childId && link.parentId === parentId)) {
    return fail('duplicate_link', [childId, parentId]);
  }
  if (kind === 'biological' && parentIdsOf(ped, childId, 'biological').length >= 2) {
    return fail('too_many_biological_parents', [childId]);
  }
  // A parent who already descends from the child would make the child their own ancestor.
  const parentsByChild = new Map<PersonId, PersonId[]>();
  for (const link of ped.parentLinks) {
    parentsByChild.set(link.childId, [...(parentsByChild.get(link.childId) ?? []), link.parentId]);
  }
  if (ancestorsOf(parentsByChild, parentId).has(childId)) {
    return fail('would_create_cycle', [childId, parentId]);
  }
  const link: ParentLink = { childId, parentId, kind };
  return ok({ ...ped, parentLinks: [...ped.parentLinks, link] });
}

export function updatePerson(ped: Pedigree, id: PersonId, patch: PersonPatch): MutationResult {
  const person = ped.persons[id];
  if (!person || !hasPerson(ped, id)) return fail('person_not_found', [id]);
  const fields = new Map<string, unknown>(Object.entries(person));
  for (const [key, value] of Object.entries(patch)) {
    // Untyped callers cannot use a patch to change the id or the conditions.
    if (value === undefined || !PATCHABLE_FIELDS.has(key)) continue;
    if (value === null && (key === 'sex' || key === 'deceased')) continue;
    if (value === null) fields.delete(key);
    else fields.set(key, value);
  }
  // The edited fields go through the same schema the loader uses, which also gives them their type.
  const candidate = Object.fromEntries(fields);
  const ageProblem = agesProblem([candidate.ageNow, candidate.ageAtDeath]);
  if (ageProblem !== null) return invalidValue(ageProblem, [id]);
  const parsed = personSchema.safeParse(candidate);
  if (!parsed.success) return invalidValue('mutation.invalid_value', [id]);
  return ok({ ...ped, persons: { ...ped.persons, [id]: parsed.data } });
}

function withoutPeople(ped: Pedigree, removed: ReadonlySet<PersonId>): Pedigree {
  return {
    ...ped,
    persons: Object.fromEntries(Object.entries(ped.persons).filter(([id]) => !removed.has(id))),
    parentLinks: ped.parentLinks.filter(
      (link) => !removed.has(link.childId) && !removed.has(link.parentId),
    ),
    partnerships: ped.partnerships.filter((pair) => !removed.has(pair.aId) && !removed.has(pair.bId)),
  };
}

/**
 * Removes a person and their links. If that would cut other people off from
 * the proband, it is refused with the list of those people, unless
 * `cascade: true`, which removes them as well.
 */
export function removePerson(
  ped: Pedigree,
  id: PersonId,
  options: { cascade?: boolean } = {},
): MutationResult {
  if (!hasPerson(ped, id)) return fail('person_not_found', [id]);
  if (id === ped.probandId) return fail('cannot_remove_proband', [id]);
  const connectedBefore = connectedTo(ped, ped.probandId);
  const remaining = withoutPeople(ped, new Set([id]));
  const connectedAfter = connectedTo(remaining, ped.probandId);
  // People who were already unconnected before this removal are not its doing.
  const stranded = [...connectedBefore].filter((other) => other !== id && !connectedAfter.has(other));
  if (stranded.length === 0) return ok(remaining);
  if (options.cascade !== true) return fail('would_disconnect', stranded.sort());
  return ok(withoutPeople(remaining, new Set(stranded)));
}

export function addParent(
  ped: Pedigree,
  childId: PersonId,
  parent: PersonRef = {},
  kind: ParentLinkKind = 'biological',
): MutationResult {
  if (!hasPerson(ped, childId)) return fail('person_not_found', [childId]);
  // Refuse before creating anyone, so a refusal leaves nothing behind.
  if (kind === 'biological' && parentIdsOf(ped, childId, 'biological').length >= 2) {
    return fail('too_many_biological_parents', [childId]);
  }
  const resolved = resolve(ped, parent);
  if (!resolved.ok || resolved.createdId === null) return resolved;
  const linked = linkParent(resolved.pedigree, childId, resolved.createdId, kind);
  return linked.ok ? ok(linked.pedigree, resolved.createdId) : linked;
}

export function addChild(
  ped: Pedigree,
  parentId: PersonId,
  child: PersonRef = {},
  options: { kind?: ParentLinkKind; otherParentId?: PersonId } = {},
): MutationResult {
  if (!hasPerson(ped, parentId)) return fail('person_not_found', [parentId]);
  const { otherParentId } = options;
  if (otherParentId !== undefined && !hasPerson(ped, otherParentId)) {
    return fail('person_not_found', [otherParentId]);
  }
  const resolved = resolve(ped, child);
  if (!resolved.ok || resolved.createdId === null) return resolved;
  const childId = resolved.createdId;
  const kind = options.kind ?? 'biological';
  let current = linkParent(resolved.pedigree, childId, parentId, kind);
  if (current.ok && otherParentId !== undefined) {
    current = linkParent(current.pedigree, childId, otherParentId, kind);
  }
  return current.ok ? ok(current.pedigree, childId) : current;
}

/**
 * Adds a full sibling (shares both biological parents) or a half sibling
 * (shares one). Parents that are not recorded yet are added as people with
 * nothing known about them, so the tree shows what is unknown.
 */
export function addSibling(
  ped: Pedigree,
  personId: PersonId,
  sibling: NewPersonInput = {},
  options: { type: 'full' | 'half'; sharedParentId?: PersonId } = { type: 'full' },
): MutationResult {
  if (!hasPerson(ped, personId)) return fail('person_not_found', [personId]);
  let current = ped;
  let parents = parentIdsOf(current, personId, 'biological');
  let shared: PersonId[];

  if (options.type === 'full') {
    while (parents.length < 2) {
      const added = addParent(current, personId);
      if (!added.ok) return added;
      current = added.pedigree;
      parents = parentIdsOf(current, personId, 'biological');
    }
    shared = parents;
  } else if (options.sharedParentId !== undefined) {
    if (!parents.includes(options.sharedParentId)) {
      return fail('shared_parent_required', [personId, options.sharedParentId]);
    }
    shared = [options.sharedParentId];
  } else if (parents.length === 2) {
    return fail('shared_parent_required', [personId]);
  } else if (parents.length === 1) {
    shared = parents;
  } else {
    const added = addParent(current, personId);
    if (!added.ok || added.createdId === null) return added;
    current = added.pedigree;
    shared = [added.createdId];
  }

  const created = addPerson(current, sibling);
  if (!created.ok || created.createdId === null) return created;
  let linked: MutationResult = created;
  for (const parentId of shared) {
    linked = linkParent(linked.pedigree, created.createdId, parentId, 'biological');
    if (!linked.ok) return linked;
  }
  return ok(linked.pedigree, created.createdId);
}

export function addPartner(
  ped: Pedigree,
  personId: PersonId,
  partner: PersonRef = {},
  status: PartnershipStatus = 'current',
): MutationResult {
  if (!hasPerson(ped, personId)) return fail('person_not_found', [personId]);
  if ('existingId' in partner) {
    const otherId = partner.existingId;
    if (otherId === personId) return fail('self_partnership', [personId]);
    const exists = ped.partnerships.some(
      (pair) =>
        (pair.aId === personId && pair.bId === otherId) ||
        (pair.aId === otherId && pair.bId === personId),
    );
    if (exists) return fail('duplicate_partnership', [personId, otherId]);
  }
  const resolved = resolve(ped, partner);
  if (!resolved.ok || resolved.createdId === null) return resolved;
  const id = nextId(
    resolved.pedigree.partnerships.map((pair) => pair.id),
    'u',
  );
  const partnerships = [
    ...resolved.pedigree.partnerships,
    { id, aId: personId, bId: resolved.createdId, status },
  ];
  return ok({ ...resolved.pedigree, partnerships }, resolved.createdId);
}

/** Adds a condition, or replaces the one with the same id. */
export function setCondition(
  ped: Pedigree,
  personId: PersonId,
  input: ConditionInput,
): MutationResult {
  const person = ped.persons[personId];
  if (!person || !hasPerson(ped, personId)) return fail('person_not_found', [personId]);
  const ageUnknown = input.ageUnknown ?? false;
  // Untyped callers (parser output, a user's choice) may pass a code that does not exist.
  if (!CONDITION_CODES.includes(input.code)) return fail('invalid_condition', [personId]);
  const domain = DOMAIN_OF_CODE[input.code];
  if (
    (input.domain !== undefined && input.domain !== domain) ||
    (ageUnknown && input.ageAtOnset !== undefined)
  ) {
    return fail('invalid_condition', [personId]);
  }
  const id =
    input.id ??
    nextId(
      person.conditions.map((condition) => condition.id),
      'c',
    );
  if (!idSchema.safeParse(id).success) return fail('invalid_id', [personId]);
  const index = person.conditions.findIndex((condition) => condition.id === id);
  if (index === -1 && person.conditions.length >= LIMITS.maxConditionsPerPerson) {
    return fail('limit_reached', [personId]);
  }
  const condition: Condition = {
    id,
    code: input.code,
    domain,
    ageUnknown,
    confirmed: input.confirmed ?? 'reported',
    ...(input.ageAtOnset !== undefined && { ageAtOnset: input.ageAtOnset }),
    ...(input.subtype !== undefined && { subtype: input.subtype }),
    ...(input.laterality !== undefined && { laterality: input.laterality }),
  };
  const onset = condition.ageAtOnset;
  if (onset !== undefined && (!Number.isInteger(onset) || onset < 0)) {
    return invalidValue('validation.age_invalid', [personId]);
  }
  if (onset !== undefined && onset > LIMITS.maxAge) {
    return invalidValue('validation.age_too_high', [personId]);
  }
  if (!conditionSchema.safeParse(condition).success) return fail('invalid_condition', [personId]);
  const conditions =
    index === -1
      ? [...person.conditions, condition]
      : person.conditions.map((existing, i) => (i === index ? condition : existing));
  return ok({ ...ped, persons: { ...ped.persons, [personId]: { ...person, conditions } } }, id);
}

export function removeCondition(
  ped: Pedigree,
  personId: PersonId,
  conditionId: string,
): MutationResult {
  const person = ped.persons[personId];
  if (!person || !hasPerson(ped, personId)) return fail('person_not_found', [personId]);
  if (!person.conditions.some((condition) => condition.id === conditionId)) {
    return fail('condition_not_found', [personId]);
  }
  const conditions = person.conditions.filter((condition) => condition.id !== conditionId);
  return ok({ ...ped, persons: { ...ped.persons, [personId]: { ...person, conditions } } });
}

export function setProband(ped: Pedigree, personId: PersonId): MutationResult {
  if (!hasPerson(ped, personId)) return fail('person_not_found', [personId]);
  return ok({ ...ped, probandId: personId });
}
