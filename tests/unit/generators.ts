import fc from 'fast-check';
import {
  CONDITION_CODES,
  CONFIRMATIONS,
  LATERALITIES,
  addChild,
  addParent,
  addPartner,
  addSibling,
  createPedigree,
  setCondition,
  updatePerson,
  validatePedigree,
} from '../../src/domain';
import type { MutationResult, Pedigree, PersonId, Sex } from '../../src/domain';

// Generators for property-based tests. A pedigree is grown from a random list
// of operations applied through the real domain mutations, and an operation is
// kept only if it adds no validation error: the same gate the person drawer
// and Quick add use. So every generated pedigree is one a user could build.

/** One fixed seed for every property, printed by fast-check when a property fails. */
export const SEED = 20261113;
export const RUNS = 500;
export const fcOptions = { seed: SEED, numRuns: RUNS } as const;

/** Ages on and around every threshold the rules use. */
export const BOUNDARY_AGES = [0, 39, 40, 49, 50, 54, 55, 59, 60, 64, 65] as const;
const SEXES: readonly Sex[] = ['female', 'male', 'female', 'male', 'unknown', 'intersex'];

export type Op =
  | { type: 'parent'; at: number; sex: Sex; kind: 'biological' | 'adoptive' | 'step' }
  | { type: 'child'; at: number; sex: Sex; otherAt: number | null }
  | { type: 'sibling'; at: number; sex: Sex; half: boolean }
  | { type: 'partner'; at: number; withAt: number | null; sex: Sex }
  | { type: 'consanguineous'; at: number; withAt: number; sex: Sex }
  | {
      type: 'condition';
      at: number;
      code: (typeof CONDITION_CODES)[number];
      age: number | 'unknown' | 'missing';
      confirmed: (typeof CONFIRMATIONS)[number];
      laterality: (typeof LATERALITIES)[number] | null;
    }
  | { type: 'deceased'; at: number; ageAtDeath: number | null }
  | { type: 'vitalUnknown'; at: number }
  | { type: 'age'; at: number; ageNow: number };

const index = fc.nat({ max: 10_000 });
const sex = fc.constantFrom(...SEXES);
const age = fc.oneof(fc.constantFrom(...BOUNDARY_AGES), fc.integer({ min: 0, max: 120 }));

export const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ type: fc.constant('parent' as const), at: index, sex, kind: fc.constantFrom('biological' as const, 'biological' as const, 'biological' as const, 'adoptive' as const, 'step' as const) }) },
  { weight: 3, arbitrary: fc.record({ type: fc.constant('child' as const), at: index, sex, otherAt: fc.option(index, { nil: null }) }) },
  { weight: 3, arbitrary: fc.record({ type: fc.constant('sibling' as const), at: index, sex, half: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ type: fc.constant('partner' as const), at: index, withAt: fc.option(index, { nil: null }), sex }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('consanguineous' as const), at: index, withAt: index, sex }) },
  {
    weight: 5,
    arbitrary: fc.record({
      type: fc.constant('condition' as const),
      at: index,
      code: fc.constantFrom(...CONDITION_CODES),
      age: fc.oneof(age, fc.constant('unknown' as const), fc.constant('missing' as const)),
      confirmed: fc.constantFrom(...CONFIRMATIONS),
      laterality: fc.option(fc.constantFrom(...LATERALITIES), { nil: null }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('deceased' as const), at: index, ageAtDeath: fc.option(age, { nil: null }) }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('vitalUnknown' as const), at: index }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('age' as const), at: index, ageNow: age }) },
);

/** Generation of each person relative to the proband (+1 parents, -1 children), through any link. */
function generations(ped: Pedigree): Map<PersonId, number> {
  const level = new Map<PersonId, number>([[ped.probandId, 0]]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const link of ped.parentLinks) {
      const c = level.get(link.childId);
      const p = level.get(link.parentId);
      if (c !== undefined && p === undefined) level.set(link.parentId, c + 1);
      else if (p !== undefined && c === undefined) level.set(link.childId, p - 1);
      else continue;
      changed = true;
    }
    for (const pair of ped.partnerships) {
      const a = level.get(pair.aId);
      const b = level.get(pair.bId);
      if (a !== undefined && b === undefined) level.set(pair.bId, a);
      else if (b !== undefined && a === undefined) level.set(pair.aId, b);
      else continue;
      changed = true;
    }
  }
  return level;
}

const errorKeys = (ped: Pedigree) =>
  new Set(validatePedigree(ped).filter((i) => i.severity === 'error').map((i) => `${i.code}|${i.personIds.join(',')}`));

/** Applies one operation; returns the result of the domain call, or null when the op does not fit. */
export function applyOp(ped: Pedigree, op: Op, limits = { maxPeople: 60, top: 3, bottom: -2 }): MutationResult | null {
  const ids = Object.keys(ped.persons);
  const pick = (n: number) => ids[n % ids.length] as PersonId;
  const at = pick(op.at);
  const level = generations(ped);
  const gen = level.get(at) ?? 0;
  const full = ids.length >= limits.maxPeople;
  switch (op.type) {
    case 'parent':
      if (full || gen + 1 > limits.top) return null;
      return addParent(ped, at, { sex: op.sex }, op.kind);
    case 'child': {
      if (full || gen - 1 < limits.bottom) return null;
      const other = op.otherAt === null ? undefined : pick(op.otherAt);
      return addChild(ped, at, { sex: op.sex }, other !== undefined && other !== at ? { otherParentId: other } : {});
    }
    case 'sibling':
      if (full || ids.length + 3 > limits.maxPeople || gen + 1 > limits.top) return null;
      return addSibling(ped, at, { sex: op.sex }, op.half ? { type: 'half' } : { type: 'full' });
    case 'partner':
      if (op.withAt === null) return full ? null : addPartner(ped, at, { sex: op.sex });
      return addPartner(ped, at, { existingId: pick(op.withAt) });
    case 'consanguineous': {
      // A child of two people already in the tree, such as first cousins.
      const other = pick(op.withAt);
      if (full || other === at || gen !== (level.get(other) ?? 0) || gen - 1 < limits.bottom) return null;
      return addChild(ped, at, { sex: op.sex }, { otherParentId: other });
    }
    case 'condition':
      return setCondition(ped, at, {
        code: op.code,
        confirmed: op.confirmed,
        ...(op.age === 'unknown' ? { ageUnknown: true } : op.age === 'missing' ? {} : { ageAtOnset: op.age }),
        ...(op.code === 'breast' && op.laterality !== null && { laterality: op.laterality }),
      });
    case 'deceased':
      return updatePerson(ped, at, { deceased: true, ageNow: null, ...(op.ageAtDeath !== null && { ageAtDeath: op.ageAtDeath }) });
    case 'vitalUnknown':
      return updatePerson(ped, at, { vitalStatusUnknown: true, healthHistoryUnknown: true });
    case 'age':
      return ped.persons[at]?.deceased ? null : updatePerson(ped, at, { ageNow: op.ageNow });
  }
}

/** Grows a pedigree from operations, keeping each one only if it adds no validation error. */
export function build(start: Pedigree, ops: readonly Op[]): Pedigree {
  let ped = start;
  let known = errorKeys(ped);
  for (const op of ops) {
    const result = applyOp(ped, op);
    if (!result?.ok) continue;
    const next = errorKeys(result.pedigree);
    if ([...next].some((key) => !known.has(key))) continue;
    ped = result.pedigree;
    known = next;
  }
  return ped;
}

export const probandArb = fc.record({
  sex: fc.constantFrom<Sex>('female', 'male', 'unknown'),
  ageNow: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
});

/** Valid pedigrees: 1 to 60 people, at most six generations (two below the proband, three above). */
// fast-check caps array lengths by a small default size, so the length is drawn explicitly
// to spread trees over the whole 1 to 60 range.
const opsArb = fc.integer({ min: 0, max: 220 }).chain((n) => fc.array(opArb, { minLength: n, maxLength: n }));

export const pedigreeArb: fc.Arbitrary<Pedigree> = fc
  .tuple(probandArb, opsArb)
  .map(([proband, ops]) =>
    build(createPedigree({ sex: proband.sex, ...(proband.ageNow !== undefined && { ageNow: proband.ageNow }) }), ops),
  );

/** A pedigree with two of its people (possibly the same one). */
export const pedigreeWithPairArb = fc.tuple(pedigreeArb, index, index).map(([ped, a, b]) => {
  const ids = Object.keys(ped.persons);
  return { ped, a: ids[a % ids.length] as PersonId, b: ids[b % ids.length] as PersonId };
});

/** Fisher-Yates shuffle driven by fast-check's random source, so failures replay from the seed. */
export function shuffled<T>(items: readonly T[], keys: readonly number[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = (keys[i % Math.max(keys.length, 1)] ?? 0) % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
