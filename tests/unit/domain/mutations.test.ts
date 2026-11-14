import {
  addChild,
  addParent,
  addPartner,
  addPerson,
  addSibling,
  createPedigree,
  createSamplePedigree,
  relationshipTo,
  removeCondition,
  removePerson,
  setCondition,
  setProband,
  updatePerson,
  validatePedigree,
} from '../../../src/domain';
import type { MutationErrorCode, MutationResult, Pedigree, PersonPatch } from '../../../src/domain';
import { deepFreeze } from '../../fixtures/pedigrees';

const sample = deepFreeze(createSamplePedigree());

function unwrap(result: MutationResult): { pedigree: Pedigree; createdId: string } {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}`);
  return { pedigree: result.pedigree, createdId: result.createdId ?? '' };
}

function errorCode(result: MutationResult): MutationErrorCode | 'ok' {
  return result.ok ? 'ok' : result.error.code;
}

describe('createPedigree and addPerson', () => {
  it('starts with only the proband', () => {
    const ped = createPedigree({ sex: 'female', ageNow: 30 });
    expect(Object.keys(ped.persons)).toEqual(['p1']);
    expect(ped.probandId).toBe('p1');
    expect(ped.persons.p1).toEqual({ id: 'p1', sex: 'female', ageNow: 30, deceased: false, conditions: [] });
  });

  it('gives each new person the next free id and unknown sex by default', () => {
    const first = unwrap(addPerson(createPedigree()));
    const second = unwrap(addPerson(first.pedigree, { displayName: 'Aunt' }));
    expect([first.createdId, second.createdId]).toEqual(['p2', 'p3']);
    expect(second.pedigree.persons.p3).toEqual({
      id: 'p3',
      displayName: 'Aunt',
      sex: 'unknown',
      deceased: false,
      conditions: [],
    });
  });

  it.each<[string, MutationErrorCode]>([
    ['proband', 'person_exists'],
    ['__proto__', 'invalid_id'],
    ['has space', 'invalid_id'],
    ['', 'invalid_id'],
  ])('refuses the id %j with %s', (id, code) => {
    expect(errorCode(addPerson(sample, { id }))).toBe(code);
  });
});

describe('updatePerson', () => {
  it('sets fields, and clears optional fields given null', () => {
    const { pedigree } = unwrap(
      updatePerson(sample, 'mother', { ageNow: 61, displayName: null, healthHistoryUnknown: true }),
    );
    expect(pedigree.persons.mother).toMatchObject({ ageNow: 61, healthHistoryUnknown: true });
    expect(pedigree.persons.mother).not.toHaveProperty('displayName');
  });

  it('ignores attempts to change the id or the conditions through a patch', () => {
    const patch = { id: 'hacked', conditions: [], sex: 'male' } as unknown as PersonPatch;
    const { pedigree } = unwrap(updatePerson(sample, 'mother', patch));
    expect(pedigree.persons.mother).toMatchObject({ id: 'mother', sex: 'male' });
    expect(pedigree.persons.mother?.conditions).toHaveLength(1);
  });
});

describe('removePerson', () => {
  it('refuses to remove the proband', () => {
    const result = removePerson(sample, 'proband', { cascade: true });
    expect(result).toMatchObject({ ok: false, error: { code: 'cannot_remove_proband' } });
  });

  it('removes a person together with their parent links and partnerships', () => {
    const { pedigree } = unwrap(removePerson(sample, 'sister'));
    expect(pedigree.persons).not.toHaveProperty('sister');
    expect(pedigree.parentLinks.some((link) => link.childId === 'sister')).toBe(false);
    expect(Object.keys(pedigree.persons)).toHaveLength(9);
  });

  it('refuses a removal that would strand others, listing who would be cut off', () => {
    const result = removePerson(sample, 'mother');
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'would_disconnect', personIds: ['maunt', 'mgf', 'mgm'] },
    });
  });

  it('removes the stranded people too when cascade is true', () => {
    const { pedigree } = unwrap(removePerson(sample, 'mother', { cascade: true }));
    expect(Object.keys(pedigree.persons).sort()).toEqual([
      'father',
      'pgf',
      'pgm',
      'proband',
      'puncle',
      'sister',
    ]);
    expect(validatePedigree(pedigree)).toEqual([]);
  });

  it('does not blame a removal for people who were already unconnected', () => {
    const withLoner = unwrap(addPerson(sample, { id: 'loner' })).pedigree;
    const { pedigree } = unwrap(removePerson(withLoner, 'sister'));
    expect(pedigree.persons).toHaveProperty('loner');
  });
});

describe('addParent and addChild', () => {
  it('adds a new biological parent and links them', () => {
    const { pedigree, createdId } = unwrap(addParent(sample, 'mgm', { sex: 'female' }));
    expect(relationshipTo(pedigree, 'proband', createdId)).toMatchObject({
      degree: 3,
      label: 'maternal great-grandmother',
    });
  });

  it('refuses a third biological parent and adds nobody', () => {
    const result = addParent(sample, 'proband', { displayName: 'Third' });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'too_many_biological_parents', personIds: ['proband'] },
    });
    expect(errorCode(addParent(sample, 'proband', { existingId: 'puncle' }))).toBe(
      'too_many_biological_parents',
    );
  });

  it('allows a step-parent in addition to two biological parents', () => {
    const { pedigree, createdId } = unwrap(addParent(sample, 'proband', { sex: 'male' }, 'step'));
    expect(relationshipTo(pedigree, 'proband', createdId)).toMatchObject({
      degree: null,
      label: 'step-parent',
      bloodline: false,
    });
  });

  it.each<[string, string, string, MutationErrorCode]>([
    ['a person as their own parent', 'mgm', 'mgm', 'self_link'],
    ['a descendant as a parent', 'mgm', 'proband', 'would_create_cycle'],
    ['a second link between the same two people', 'proband', 'mother', 'duplicate_link'],
    ['a parent who is not in the tree', 'mgm', 'ghost', 'person_not_found'],
  ])('refuses %s', (_name, childId, parentId, code) => {
    expect(errorCode(addParent(sample, childId, { existingId: parentId }, 'step'))).toBe(code);
  });

  it('adds a child linked to both parents', () => {
    const { pedigree, createdId } = unwrap(
      addChild(sample, 'mother', { sex: 'male' }, { otherParentId: 'father' }),
    );
    expect(relationshipTo(pedigree, 'proband', createdId)).toMatchObject({
      degree: 1,
      label: 'brother',
    });
  });

  it('adds an adopted child, who is not a blood relative', () => {
    const { pedigree, createdId } = unwrap(addChild(sample, 'proband', {}, { kind: 'adoptive' }));
    expect(relationshipTo(pedigree, 'proband', createdId)).toMatchObject({
      degree: null,
      label: 'adopted child',
      bloodline: false,
    });
  });
});

describe('addSibling', () => {
  it('adds a full sibling of a lone proband, recording both unknown parents', () => {
    const { pedigree, createdId } = unwrap(addSibling(createPedigree(), 'p1', { sex: 'male' }));
    expect(Object.keys(pedigree.persons)).toHaveLength(4);
    expect(relationshipTo(pedigree, 'p1', createdId)).toMatchObject({ degree: 1, label: 'brother' });
    expect(validatePedigree(pedigree)).toEqual([]);
  });

  it('adds a full sibling using the existing parents', () => {
    const { pedigree, createdId } = unwrap(addSibling(sample, 'proband', { sex: 'female' }));
    expect(Object.keys(pedigree.persons)).toHaveLength(11);
    expect(relationshipTo(pedigree, 'sister', createdId)).toMatchObject({ degree: 1, label: 'sister' });
  });

  it('adds a half sibling through the chosen shared parent', () => {
    const { pedigree, createdId } = unwrap(
      addSibling(sample, 'proband', { sex: 'male' }, { type: 'half', sharedParentId: 'father' }),
    );
    expect(relationshipTo(pedigree, 'proband', createdId)).toEqual({
      degree: 2,
      label: 'half-brother',
      side: 'paternal',
      generationDelta: 0,
      bloodline: true,
      consanguinity: false,
    });
  });

  it.each<[string, { type: 'half'; sharedParentId?: string }, MutationErrorCode]>([
    ['no shared parent chosen when there are two', { type: 'half' }, 'shared_parent_required'],
    [
      'a shared parent who is not a parent',
      { type: 'half', sharedParentId: 'puncle' },
      'shared_parent_required',
    ],
  ])('refuses a half sibling with %s', (_name, options, code) => {
    expect(errorCode(addSibling(sample, 'proband', {}, options))).toBe(code);
  });
});

describe('addPartner', () => {
  it('adds a new partner, and allows a second partner for the same person', () => {
    const first = unwrap(addPartner(sample, 'proband', { sex: 'female' }, 'former'));
    const second = unwrap(addPartner(first.pedigree, 'proband', { sex: 'male' }));
    expect(relationshipTo(second.pedigree, 'proband', first.createdId).label).toBe('former partner');
    expect(relationshipTo(second.pedigree, 'proband', second.createdId).label).toBe('partner');
    expect(second.pedigree.partnerships.map((pair) => pair.id)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
  });

  it.each<[string, string, string, MutationErrorCode]>([
    ['a person as their own partner', 'mother', 'mother', 'self_partnership'],
    ['an existing couple again', 'mother', 'father', 'duplicate_partnership'],
    ['an existing couple the other way round', 'father', 'mother', 'duplicate_partnership'],
    ['a partner who is not in the tree', 'mother', 'ghost', 'person_not_found'],
  ])('refuses %s', (_name, personId, partnerId, code) => {
    expect(errorCode(addPartner(sample, personId, { existingId: partnerId }))).toBe(code);
  });
});

describe('setCondition and removeCondition', () => {
  it('adds a condition with the domain taken from its code', () => {
    const { pedigree, createdId } = unwrap(
      setCondition(sample, 'sister', { code: 'high_ldl', ageUnknown: true }),
    );
    expect(createdId).toBe('c1');
    expect(pedigree.persons.sister?.conditions).toEqual([
      { id: 'c1', code: 'high_ldl', domain: 'metabolic', ageUnknown: true, confirmed: 'reported' },
    ]);
  });

  it('replaces a condition that has the same id', () => {
    const { pedigree } = unwrap(
      setCondition(sample, 'mother', {
        id: 'c1',
        code: 'breast',
        ageAtOnset: 39,
        laterality: 'bilateral',
        confirmed: 'confirmed',
      }),
    );
    expect(pedigree.persons.mother?.conditions).toEqual([
      {
        id: 'c1',
        code: 'breast',
        domain: 'cancer',
        ageAtOnset: 39,
        ageUnknown: false,
        laterality: 'bilateral',
        confirmed: 'confirmed',
      },
    ]);
  });

  it.each<[string, Parameters<typeof setCondition>[2]]>([
    ['an age together with "age unknown"', { code: 'breast', ageAtOnset: 40, ageUnknown: true }],
    ['a domain that does not match the code', { code: 'breast', domain: 'cardio' }],
  ])('refuses %s', (_name, input) => {
    expect(errorCode(setCondition(sample, 'sister', input))).toBe('invalid_condition');
  });

  it('removes a condition, and refuses one that is not there', () => {
    const { pedigree } = unwrap(removeCondition(sample, 'mother', 'c1'));
    expect(pedigree.persons.mother?.conditions).toEqual([]);
    expect(errorCode(removeCondition(sample, 'mother', 'c9'))).toBe('condition_not_found');
  });
});

describe('setProband', () => {
  it('moves the proband to another person', () => {
    const { pedigree } = unwrap(setProband(sample, 'sister'));
    expect(pedigree.probandId).toBe('sister');
    expect(relationshipTo(pedigree, pedigree.probandId, 'proband').label).toBe('sister');
  });
});

describe('every mutation', () => {
  const calls: [string, (ped: Pedigree, id: string) => MutationResult][] = [
    ['updatePerson', (ped, id) => updatePerson(ped, id, { sex: 'male' })],
    ['removePerson', (ped, id) => removePerson(ped, id, { cascade: true })],
    ['addParent', (ped, id) => addParent(ped, id, {}, 'step')],
    ['addChild', (ped, id) => addChild(ped, id)],
    ['addSibling', (ped, id) => addSibling(ped, id)],
    ['addPartner', (ped, id) => addPartner(ped, id)],
    ['setCondition', (ped, id) => setCondition(ped, id, { code: 'stroke', ageAtOnset: 70 })],
    ['removeCondition', (ped, id) => removeCondition(ped, id, 'c1')],
    ['setProband', (ped, id) => setProband(ped, id)],
  ];

  it.each(calls)('%s refuses a person who is not in the tree, with a message', (_name, call) => {
    const result = call(sample, 'ghost');
    expect(result).toMatchObject({ ok: false, error: { code: 'person_not_found' } });
    expect(result.ok ? '' : result.error.message).not.toBe('');
  });

  // The sample is deeply frozen: any in-place change would throw here.
  it.each([...calls, ['addPerson', (ped: Pedigree) => addPerson(ped)] as const])(
    '%s returns a new pedigree and leaves its input untouched',
    (_name, call) => {
      const pristine = createSamplePedigree();
      const result = call(sample, 'mother');
      expect(result.ok).toBe(true);
      expect(result.ok && result.pedigree).not.toBe(sample);
      expect(sample).toEqual(pristine);
    },
  );
});
