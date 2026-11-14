import { addParent, createPedigree, createSamplePedigree, deserialize, relationshipTo, serialize, setCondition, updatePerson } from '../../../src/domain';
import { t } from '../../../src/i18n';
import type { Pedigree } from '../../../src/domain';
import { planEntry, resolveEntries } from '../../../src/parser/resolve';
import type { FamilySide, ProposedEntry, RelationKey } from '../../../src/parser';
import { deepFreeze } from '../../fixtures/pedigrees';

// Every relation key the parsers can produce is resolved to a person whose
// place in the tree matches the key, on an empty tree and on the sample.

const entry = (fields: Partial<ProposedEntry> & Pick<ProposedEntry, 'relation'>): ProposedEntry => ({
  id: 'e1',
  conditions: [{ code: 'colorectal', ageAtOnset: 45, ageUnknown: false, certainty: 'reported' }],
  sourceSpan: { start: 0, end: 0 },
  ...fields,
});

type Expected = { degree: 1 | 2 | 3 | null; generationDelta: number; side?: 'maternal' | 'paternal' };
const CASES: [RelationKey, FamilySide | undefined, Expected][] = [
  ['mother', undefined, { degree: 1, generationDelta: 1, side: 'maternal' }],
  ['father', undefined, { degree: 1, generationDelta: 1, side: 'paternal' }],
  ['sister', undefined, { degree: 1, generationDelta: 0 }],
  ['brother', undefined, { degree: 1, generationDelta: 0 }],
  ['half_sister', 'maternal', { degree: 2, generationDelta: 0, side: 'maternal' }],
  ['half_brother', 'paternal', { degree: 2, generationDelta: 0, side: 'paternal' }],
  ['daughter', undefined, { degree: 1, generationDelta: -1 }],
  ['son', undefined, { degree: 1, generationDelta: -1 }],
  ['maternal_grandmother', undefined, { degree: 2, generationDelta: 2, side: 'maternal' }],
  ['maternal_grandfather', undefined, { degree: 2, generationDelta: 2, side: 'maternal' }],
  ['paternal_grandmother', undefined, { degree: 2, generationDelta: 2, side: 'paternal' }],
  ['paternal_grandfather', undefined, { degree: 2, generationDelta: 2, side: 'paternal' }],
  ['aunt', 'maternal', { degree: 2, generationDelta: 1, side: 'maternal' }],
  ['uncle', 'paternal', { degree: 2, generationDelta: 1, side: 'paternal' }],
  ['niece', undefined, { degree: 2, generationDelta: -1 }],
  ['nephew', undefined, { degree: 2, generationDelta: -1 }],
  ['cousin', 'maternal', { degree: 3, generationDelta: 0, side: 'maternal' }],
  ['cousin', 'paternal', { degree: 3, generationDelta: 0, side: 'paternal' }],
  ['grandchild', undefined, { degree: 2, generationDelta: -2 }],
  ['partner', undefined, { degree: null, generationDelta: 0 }],
];

function resolveOn(start: Pedigree, relation: RelationKey, side: FamilySide | undefined) {
  // Always add someone new, so the expectation is about the new person.
  let decision: Parameters<typeof planEntry>[2] = { target: 'new', ...(side && { side }) };
  let result = planEntry(start, entry({ relation, ...(side && { side }) }), decision);
  for (let round = 0; round < 3 && result.preview.status === 'needs_choice'; round += 1) {
    for (const choice of result.preview.choices) {
      if (choice.kind === 'target') decision = { ...decision, target: 'new' };
      if (choice.kind === 'via' && choice.value === undefined) decision = { ...decision, via: choice.options[0] ?? 'new' };
    }
    result = planEntry(start, entry({ relation, ...(side && { side }) }), decision);
  }
  return result;
}

describe.each([
  ['an empty tree', () => createPedigree({ sex: 'female', ageNow: 40 })],
  ['the sample family', () => createSamplePedigree()],
])('resolver relation keys on %s', (_name, make) => {
  it.each(CASES)('%s (%s) lands in the right place', (relation, side, expected) => {
    const start = deepFreeze(make());
    const { preview, pedigree } = resolveOn(start, relation, side);
    expect(preview.status).toBe('ready');
    const targetId = preview.targetId ?? '';
    const rel = relationshipTo(pedigree, pedigree.probandId, targetId);
    expect(rel.degree).toBe(expected.degree);
    expect(rel.generationDelta).toBe(expected.generationDelta);
    if (expected.side) expect(rel.side).toBe(expected.side);
    expect(pedigree.persons[targetId]?.conditions.some((c) => c.code === 'colorectal')).toBe(true);
    // Whatever the resolver builds must load again after a reload.
    expect(deserialize(serialize(pedigree)).ok).toBe(true);
  });
});

describe('resolver: other branches', () => {
  it('"self" puts the condition on the proband and adds nobody', () => {
    const start = createPedigree({ sex: 'male' });
    const { preview, pedigree } = planEntry(start, entry({ relation: 'self' }));
    expect(preview.targetId).toBe(start.probandId);
    expect(Object.keys(pedigree.persons)).toHaveLength(1);
  });

  it('a side-less aunt, cousin or half-sibling waits for the side and changes nothing', () => {
    for (const relation of ['aunt', 'cousin', 'half_brother'] as const) {
      const start = createSamplePedigree();
      const { preview, pedigree } = planEntry(start, entry({ relation }));
      expect(preview.status).toBe('needs_choice');
      expect(pedigree).toBe(start);
    }
  });

  it('a grandparent with a side ambiguity uses the chosen side', () => {
    const start = createSamplePedigree();
    const proposal = entry({ relation: 'maternal_grandmother', ambiguity: { kind: 'side', options: ['maternal', 'paternal'] } });
    expect(planEntry(start, proposal).preview.status).toBe('needs_choice');
    const { preview } = planEntry(start, proposal, { side: 'paternal' });
    expect(preview.relation).toBe('paternal_grandmother');
    expect(preview.targetId).toBe('pgm');
  });

  it('a relation ambiguity uses the chosen relation and ignores an option it did not offer', () => {
    const start = createSamplePedigree();
    const proposal = entry({ relation: 'mother', ambiguity: { kind: 'relation', options: ['mother', 'father'] } });
    expect(planEntry(start, proposal, { option: 'sister' }).preview.status).toBe('needs_choice');
    const { preview } = planEntry(start, proposal, { option: 'father' });
    expect(preview).toMatchObject({ relation: 'father', targetId: 'father', status: 'ready' });
  });

  it('fills in an unrecorded sex and name on an existing person, but never replaces a recorded name', () => {
    let start = createPedigree({ sex: 'female' });
    start = resolveEntries(start, [entry({ relation: 'cousin', side: 'maternal', conditions: [] })]).pedigree;
    const cousin = Object.values(start.persons).find((p) => relationshipTo(start, start.probandId, p.id).degree === 3);
    expect(cousin?.sex).toBe('unknown');
    const named = planEntry(start, entry({ relation: 'cousin', side: 'maternal', sex: 'female', displayName: 'Ana' }), { via: 'irrelevant' });
    const filled = named.pedigree.persons[cousin?.id ?? ''];
    expect(filled).toMatchObject({ sex: 'female', displayName: 'Ana' });
    const renamed = planEntry(named.pedigree, entry({ relation: 'cousin', side: 'maternal', displayName: 'Bea' }));
    expect(renamed.pedigree.persons[cousin?.id ?? '']?.displayName).toBe('Ana');
  });

  it('marks someone deceased when nothing says they are living, and records the age at death', () => {
    const start = createSamplePedigree();
    const { preview, pedigree } = planEntry(start, entry({ relation: 'paternal_grandmother', conditions: [], deceased: true, ageAtDeath: 80 }));
    expect(preview.markDeceased).toBe(true);
    expect(pedigree.persons.pgm).toMatchObject({ deceased: true, ageAtDeath: 80 });
    expect(pedigree.persons.pgm?.vitalStatusUnknown).toBeUndefined();
  });

  it('fills a missing age at death, and asks before changing a recorded one', () => {
    const died = updatePerson(createSamplePedigree(), 'mgf', { deceased: true });
    if (!died.ok) throw new Error(died.error.message);
    const filled = planEntry(died.pedigree, entry({ relation: 'maternal_grandfather', conditions: [], deceased: true, ageAtDeath: 70 }));
    expect(filled.pedigree.persons.mgf?.ageAtDeath).toBe(70);

    const proposal = entry({ relation: 'maternal_grandfather', conditions: [], deceased: true, ageAtDeath: 75 });
    const asked = planEntry(filled.pedigree, proposal);
    expect(asked.preview.status).toBe('needs_choice');
    expect(asked.preview.choices.find((c) => c.kind === 'conflict')?.conflict?.subject).toBe('vital');
    const replaced = planEntry(filled.pedigree, proposal, { conflicts: { 'conflict:vital': 'replace' } });
    expect(replaced.pedigree.persons.mgf?.ageAtDeath).toBe(75);
    const kept = planEntry(filled.pedigree, proposal, { conflicts: { 'conflict:vital': 'keep' } });
    expect(kept.pedigree.persons.mgf?.ageAtDeath).toBe(70);
  });

  it('a new person said to be deceased is shown as such', () => {
    const { preview } = planEntry(createPedigree({ sex: 'female' }), entry({ relation: 'brother', deceased: true }));
    expect(preview.markDeceased).toBe(true);
  });

  it('marks a recorded-living person deceased only after the user says so', () => {
    const start = createSamplePedigree();
    const proposal = entry({ relation: 'father', conditions: [], deceased: true });
    expect(planEntry(start, proposal).preview.status).toBe('needs_choice');
    const { pedigree } = planEntry(start, proposal, { conflicts: { 'conflict:vital': 'replace' } });
    expect(pedigree.persons.father).toMatchObject({ deceased: true });
    expect(pedigree.persons.father?.ageNow).toBeUndefined();
  });

  it('refuses a parent of a given sex when both recorded parents are of the other sex', () => {
    // Two fathers recorded: a "mother" would be a third biological parent.
    let ped = createPedigree({ sex: 'female' });
    for (const id of ['f1', 'f2']) {
      const added = addParent(ped, ped.probandId, { id, sex: 'male' });
      if (!added.ok) throw new Error(added.error.message);
      ped = added.pedigree;
    }
    const { preview, pedigree } = planEntry(ped, entry({ relation: 'mother', conditions: [] }));
    expect(preview.status).toBe('refused');
    expect(preview.problem).toBe(t('quick.problem.parentsFull'));
    expect(pedigree).toBe(ped);
  });

  it('a condition on a person whose condition list is full is refused with a reason, not thrown', () => {
    let ped = createSamplePedigree();
    for (let i = 0; i < 50; i += 1) {
      const result = setCondition(ped, 'father', { code: 'stroke', ageUnknown: true });
      if (!result.ok) break;
      ped = result.pedigree;
    }
    const { preview } = planEntry(ped, entry({ relation: 'father' }));
    expect(preview.status).toBe('refused');
  });
});
