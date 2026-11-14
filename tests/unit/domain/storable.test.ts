import {
  addPerson,
  createPedigree,
  createSamplePedigree,
  deserialize,
  serialize,
  setCondition,
  updatePerson,
} from '../../../src/domain';
import type { ConditionCode, MutationResult, PersonPatch } from '../../../src/domain';
import { proposedEntrySchema } from '../../../src/parser/types';
import { planEntry } from '../../../src/parser/resolve';

// A mutation must never return a pedigree that the loader would refuse after a reload.

function reloads(result: MutationResult): boolean {
  if (!result.ok) return true;
  return deserialize(serialize(result.pedigree)).ok;
}

describe('every successful mutation leaves a pedigree that loads again', () => {
  const sample = createSamplePedigree();
  const patches: [string, PersonPatch][] = [
    ['an age of 121', { ageNow: 121 }],
    ['a negative age', { ageNow: -1 }],
    ['a fractional age', { ageAtDeath: 12.5 }],
    ['an age that is not a number', { ageNow: Number.NaN }],
    ['a name of 81 characters', { displayName: 'x'.repeat(81) }],
    ['notes of 2001 characters', { notes: 'n'.repeat(2001) }],
    ['a birth year of 1700', { birthYear: 1700 }],
    ['a birth year of 2026.5', { birthYear: 2026.5 }],
  ];
  it.each(patches)('updatePerson refuses %s with invalid_value', (_label, patch) => {
    const result = updatePerson(sample, 'mother', patch);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('invalid_value');
    expect(reloads(result)).toBe(true);
  });

  it('updatePerson keeps the specific age messages the drawer shows', () => {
    const tooHigh = updatePerson(sample, 'mother', { ageNow: 121 });
    const fraction = updatePerson(sample, 'mother', { ageNow: 3.5 });
    expect(!tooHigh.ok && tooHigh.error.message).toBe('An age above 120 is recorded.');
    expect(!fraction.ok && fraction.error.message).toBe('An age must be a whole number, zero or above.');
  });

  it('accepts the boundary values 0, 120, an 80-character name and 2000-character notes', () => {
    for (const patch of [{ ageNow: 0 }, { ageNow: 120 }, { displayName: 'x'.repeat(80) }, { notes: 'n'.repeat(2000) }]) {
      const result = updatePerson(sample, 'mother', patch);
      expect(result.ok).toBe(true);
      expect(reloads(result)).toBe(true);
    }
  });

  it('addPerson refuses values the loader would refuse', () => {
    expect(addPerson(sample, { ageNow: 500 }).ok).toBe(false);
    expect(addPerson(sample, { displayName: 'y'.repeat(200) }).ok).toBe(false);
  });

  it('createPedigree drops proband values that could not be stored', () => {
    const ped = createPedigree({ ageNow: 999, sex: 'female' });
    expect(deserialize(serialize(ped)).ok).toBe(true);
    expect(ped.persons[ped.probandId]?.ageNow).toBeUndefined();
  });

  it.each([
    ['an unknown condition code', { code: 'admin' as ConditionCode }],
    ['an onset age of 121', { code: 'breast' as ConditionCode, ageAtOnset: 121 }],
    ['a fractional onset age', { code: 'breast' as ConditionCode, ageAtOnset: 38.5 }],
    ['a subtype of 41 characters', { code: 'breast' as ConditionCode, subtype: 's'.repeat(41) }],
  ])('setCondition refuses %s', (_label, input) => {
    const result = setCondition(sample, 'mother', input);
    expect(result.ok).toBe(false);
    expect(reloads(result)).toBe(true);
  });
});

describe('a hostile parser answer cannot put an unknown condition into the tree', () => {
  const hostile = {
    id: 'e1',
    relation: 'mother',
    conditions: [{ code: 'breast', ageUnknown: false, certainty: 'reported' }],
    sourceSpan: { start: 0, end: 5 },
    ambiguity: { kind: 'condition', options: ['breast', 'admin'] },
  };

  it('the shared schema refuses an ambiguity option that is not a known value', () => {
    expect(proposedEntrySchema.safeParse(hostile).success).toBe(false);
    for (const [kind, bad] of [['relation', 'admin'], ['side', 'upstairs']]) {
      const entry = { ...hostile, ambiguity: { kind, options: ['maternal', bad] } };
      expect(proposedEntrySchema.safeParse(entry).success).toBe(false);
    }
  });

  it('even if such an entry reached the resolver, choosing the bad option is refused, not saved', () => {
    // Bypasses the schema on purpose, as a second line of defence.
    const entry = hostile as unknown as Parameters<typeof planEntry>[1];
    const { preview, pedigree } = planEntry(createSamplePedigree(), entry, { option: 'admin' });
    expect(preview.status).toBe('refused');
    expect(deserialize(serialize(pedigree)).ok).toBe(true);
  });
});
