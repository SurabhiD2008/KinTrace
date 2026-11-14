// 500 generated families per property take longer than the 5-second default.
vi.setConfig({ testTimeout: 120_000 });
import fc from 'fast-check';
import {
  CONDITION_CODES,
  STRUCTURAL_CODES,
  addChild,
  addParent,
  addPartner,
  addPerson,
  addSibling,
  deserialize,
  removeCondition,
  removePerson,
  serialize,
  setCondition,
  setProband,
  updatePerson,
  validatePedigree,
} from '../../../src/domain';
import type { MutationErrorCode, MutationResult, Pedigree } from '../../../src/domain';
import { createPedigreeStore } from '../../../src/state/store';
import { fcOptions, pedigreeArb } from '../generators';

// Random sequences of mutations, valid and invalid, through the real domain functions.

const ERROR_CODES: readonly MutationErrorCode[] = [
  'person_not_found', 'person_exists', 'invalid_id', 'limit_reached', 'cannot_remove_proband',
  'would_disconnect', 'too_many_biological_parents', 'duplicate_link', 'self_link',
  'would_create_cycle', 'shared_parent_required', 'duplicate_partnership', 'self_partnership',
  'condition_not_found', 'invalid_condition', 'invalid_value',
];
/** Value errors a mutation must never let through, because the loader refuses them. */
const VALUE_CODES = new Set(['age_invalid', 'age_too_high']);

const hostileId = fc.constantFrom('__proto__', 'constructor', 'toString', '', ' ', 'p99', '<b>', 'x'.repeat(65));
const anyNumber = fc.oneof(
  fc.integer({ min: -5, max: 130 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, -0, 12.5, Number.MAX_VALUE, 0, 120, 121),
);
const anyText = fc.oneof(fc.string({ maxLength: 20 }), fc.constantFrom('x'.repeat(81), 'n'.repeat(2001), '<img src=x onerror=alert(1)>'));

type Mutation = (ped: Pedigree) => MutationResult;
const mutationArb: fc.Arbitrary<Mutation> = fc
  .tuple(fc.nat(), fc.nat(), fc.option(hostileId, { freq: 4, nil: null }), anyNumber, anyText, fc.nat({ max: 11 }), fc.constantFrom(...CONDITION_CODES, 'admin'))
  .map(([a, b, bad, num, text, which, code]) => (ped: Pedigree) => {
    const ids = Object.keys(ped.persons);
    const pick = (n: number) => bad ?? (ids[n % ids.length] as string);
    const x = pick(a);
    const y = pick(b);
    switch (which) {
      case 0: return addParent(ped, x, { sex: 'female' }, num % 3 === 0 ? 'step' : 'biological');
      case 1: return addChild(ped, x, { sex: 'male' }, y !== x ? { otherParentId: y } : {});
      case 2: return addSibling(ped, x, {}, { type: num % 2 === 0 ? 'full' : 'half' });
      case 3: return addPartner(ped, x, a % 2 === 0 ? { existingId: y } : {});
      case 4: return addPerson(ped, { ageNow: num, displayName: text });
      case 5: return updatePerson(ped, x, { ageNow: num });
      case 6: return updatePerson(ped, x, { displayName: text, notes: text });
      case 7: return updatePerson(ped, x, { deceased: true, ageAtDeath: num });
      case 8: return setCondition(ped, x, { code: code as (typeof CONDITION_CODES)[number], ageAtOnset: num });
      case 9: return removeCondition(ped, x, 'c1');
      case 10: return removePerson(ped, x, { cascade: num % 2 === 0 });
      default: return setProband(ped, y);
    }
  });

describe('mutation sequences', () => {
  it('each step returns a typed error or a pedigree that validates structurally and loads again', () => {
    fc.assert(
      fc.property(pedigreeArb, fc.array(mutationArb, { minLength: 1, maxLength: 40 }), (start, mutations) => {
        let ped = start;
        for (const mutate of mutations) {
          const before = serialize(ped);
          const result = mutate(ped);
          // Pure: the input is never changed, whatever the outcome.
          expect(serialize(ped)).toBe(before);
          if (!result.ok) {
            expect(ERROR_CODES).toContain(result.error.code);
            expect(result.error.message.length).toBeGreaterThan(0);
            continue;
          }
          const errors = validatePedigree(result.pedigree).filter((i) => i.severity === 'error');
          expect(errors.filter((i) => STRUCTURAL_CODES.has(i.code) || VALUE_CODES.has(i.code))).toEqual([]);
          expect(deserialize(serialize(result.pedigree)).ok).toBe(true);
          ped = result.pedigree;
        }
      }),
      fcOptions,
    );
  });

  it('through the store, undoing every applied step returns the starting pedigree, and redo returns the end', () => {
    fc.assert(
      fc.property(pedigreeArb, fc.array(mutationArb, { minLength: 1, maxLength: 40 }), (start, mutations) => {
        const store = createPedigreeStore(null);
        store.getState().replace(start);
        let applied = 0;
        for (const mutate of mutations) if (store.getState().apply(mutate).ok) applied += 1;
        const end = store.getState().pedigree;
        for (let i = 0; i < applied; i += 1) store.getState().undo();
        expect(store.getState().pedigree).toEqual(start);
        for (let i = 0; i < applied; i += 1) store.getState().redo();
        expect(store.getState().pedigree).toEqual(end);
      }),
      fcOptions,
    );
  });
});

describe('serialization', () => {
  it('round-trips every generated pedigree exactly', () => {
    fc.assert(
      fc.property(pedigreeArb, (ped) => {
        const loaded = deserialize(serialize(ped));
        expect(loaded.ok).toBe(true);
        if (loaded.ok) expect(loaded.pedigree).toEqual(ped);
      }),
      fcOptions,
    );
  });
});
