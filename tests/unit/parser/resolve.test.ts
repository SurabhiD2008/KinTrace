import { createPedigree, createSamplePedigree, validatePedigree } from '../../../src/domain';
import type { Pedigree } from '../../../src/domain';
import { parseOffline } from '../../../src/parser';
import { planEntry, resolveEntries } from '../../../src/parser/resolve';
import type { ProposedEntry } from '../../../src/parser';
import { deepFreeze } from '../../fixtures/pedigrees';

const entry = (fields: Partial<ProposedEntry> & Pick<ProposedEntry, 'relation'>): ProposedEntry => ({
  id: 'e1',
  conditions: [],
  sourceSpan: { start: 0, end: 0 },
  ...fields,
});
const breast = (age?: number) => ({
  code: 'breast' as const,
  ageUnknown: false,
  certainty: 'reported' as const,
  ...(age !== undefined && { ageAtOnset: age }),
});
const people = (ped: Pedigree) => Object.keys(ped.persons).length;

describe('resolver: reuse and merge', () => {
  it('adds the condition to the existing mother instead of creating a second one', () => {
    const sample = deepFreeze(createSamplePedigree());
    const { preview, pedigree } = planEntry(sample, entry({ relation: 'mother', conditions: [{ ...breast(), code: 'ovarian', ageAtOnset: 55 }] }));
    expect(preview).toMatchObject({ status: 'ready', targetId: 'mother', targetIsNew: false, placeholders: [] });
    expect(people(pedigree)).toBe(people(sample));
    expect(pedigree.persons.mother?.conditions.map((c) => [c.code, c.ageAtOnset])).toEqual([['breast', 38], ['ovarian', 55]]);
  });

  it('treats the same condition at the same age as a duplicate and changes nothing', () => {
    const sample = createSamplePedigree();
    const { preview, pedigree } = planEntry(sample, entry({ relation: 'mother', conditions: [breast(38)] }));
    expect(preview.status).toBe('nothing_new');
    expect(preview.duplicates).toHaveLength(1);
    expect(pedigree).toBe(sample);
  });

  it('asks before replacing a different age, showing both values, and never overwrites silently', () => {
    const sample = createSamplePedigree();
    const proposal = entry({ relation: 'mother', conditions: [breast(42)] });
    const asked = planEntry(sample, proposal);
    expect(asked.preview.status).toBe('needs_choice');
    expect(asked.pedigree).toBe(sample);
    const choice = asked.preview.choices.find((c) => c.kind === 'conflict');
    expect(choice?.conflict).toMatchObject({ recorded: 'started at 38', proposed: 'started at 42', subject: 'breast cancer' });

    const kept = planEntry(sample, proposal, { conflicts: { 'conflict:breast': 'keep' } });
    expect(kept.preview.status).toBe('nothing_new');
    const replaced = planEntry(sample, proposal, { conflicts: { 'conflict:breast': 'replace' } });
    expect(replaced.preview.status).toBe('ready');
    expect(replaced.pedigree.persons.mother?.conditions[0]?.ageAtOnset).toBe(42);
  });

  it('fills an age that is missing, without asking', () => {
    const start = resolveEntries(createPedigree({ sex: 'female' }), [entry({ relation: 'mother', conditions: [breast()] })]).pedigree;
    const { preview, pedigree } = planEntry(start, entry({ relation: 'mother', conditions: [breast(38)] }));
    expect(preview.filled).toHaveLength(1);
    const mother = Object.values(pedigree.persons).find((p) => p.sex === 'female' && p.id !== pedigree.probandId);
    expect(mother?.conditions[0]?.ageAtOnset).toBe(38);
  });

  it('asks before marking someone recorded as living as deceased', () => {
    const sample = createSamplePedigree();
    const { preview } = planEntry(sample, entry({ relation: 'father', deceased: true, ageAtDeath: 70 }));
    expect(preview.status).toBe('needs_choice');
    expect(preview.choices.find((c) => c.key === 'conflict:vital')?.conflict).toMatchObject({ recorded: 'living, aged 63', proposed: 'deceased' });
  });
});

describe('resolver: missing people', () => {
  it('creates a maternal aunt with placeholder mother and grandparents, marked as not known', () => {
    const ped = createPedigree({ sex: 'female', ageNow: 30 });
    const { preview, pedigree } = planEntry(ped, entry({ relation: 'aunt', side: 'maternal', sex: 'female', conditions: [breast(50)] }));
    expect(preview.status).toBe('ready');
    expect(preview.placeholders).toHaveLength(3);
    for (const id of preview.placeholders) {
      expect(pedigree.persons[id]).toMatchObject({ healthHistoryUnknown: true, vitalStatusUnknown: true });
    }
    const aunt = pedigree.persons[preview.targetId ?? ''];
    expect(aunt).toMatchObject({ sex: 'female' });
    expect(aunt?.healthHistoryUnknown).toBeUndefined();
  });

  it('shares one mother between "my mum" and "her sister" when resolved together', () => {
    const ped = createPedigree({ sex: 'female' });
    const parsed = parseOffline('My mum had breast cancer at 38. Her sister had ovarian cancer at 44. My dad had a heart attack at 57.');
    const { previews, pedigree } = resolveEntries(ped, parsed.entries);
    expect(previews.map((p) => p.status)).toEqual(['ready', 'ready', 'ready']);
    expect(previews[0]?.targetIsNew).toBe(true);
    // The aunt reuses the mother added by the first entry.
    expect(previews[1]?.placeholders).toHaveLength(2);
    const mothers = Object.values(pedigree.persons).filter((p) => p.conditions.some((c) => c.code === 'breast'));
    expect(mothers).toHaveLength(1);
    expect(people(pedigree)).toBe(1 + 1 + 1 + 2 + 1);
    expect(validatePedigree(pedigree).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('asks which sister when there are two, and offers someone new', () => {
    let ped = createPedigree({ sex: 'female' });
    ped = resolveEntries(ped, [entry({ id: 'a', relation: 'sister' })]).pedigree;
    ped = planEntry(ped, entry({ id: 'b', relation: 'sister' }), { target: 'new' }).pedigree;
    const { preview } = planEntry(ped, entry({ relation: 'sister', conditions: [breast(40)] }));
    expect(preview.status).toBe('needs_choice');
    const target = preview.choices.find((c) => c.kind === 'target');
    expect(target?.options).toHaveLength(3);
    expect(target?.options).toContain('new');
  });

  it('asks for the side when it is not known, and uses the answer', () => {
    const ped = createPedigree({ sex: 'female' });
    const proposal = entry({ relation: 'uncle', conditions: [] });
    expect(planEntry(ped, proposal).preview.status).toBe('needs_choice');
    const answered = planEntry(ped, proposal, { side: 'paternal' });
    expect(answered.preview).toMatchObject({ status: 'ready', side: 'paternal' });
  });

  it('uses the chosen condition for an ambiguous entry and keeps its age', () => {
    const ped = createSamplePedigree();
    const parsed = parseOffline('Not sure whether my mum had breast or ovarian cancer at 50.');
    const first = parsed.entries[0];
    if (!first) throw new Error('no entry');
    expect(planEntry(ped, first).preview.status).toBe('needs_choice');
    const { pedigree } = planEntry(ped, first, { option: 'ovarian' });
    expect(pedigree.persons.mother?.conditions.find((c) => c.code === 'ovarian')).toMatchObject({ ageAtOnset: 50, confirmed: 'unsure' });
  });

  it('keeps a fuzzy age in the notes and records the age as unknown', () => {
    const parsed = parseOffline('My mum had breast cancer in her forties.');
    const { pedigree, previews } = resolveEntries(createPedigree({ sex: 'female' }), parsed.entries);
    const mother = pedigree.persons[previews[0]?.targetId ?? ''];
    expect(mother?.conditions[0]).toMatchObject({ ageUnknown: true });
    expect(mother?.conditions[0]?.ageAtOnset).toBeUndefined();
    expect(mother?.notes).toBe('breast cancer: age given as "in her forties"');
  });

  it('refuses, with the reason, an entry that would contradict the tree', () => {
    const sample = createSamplePedigree();
    // The sample mother is 60; a condition starting at 70 cannot be right.
    const { preview, pedigree } = planEntry(sample, entry({ relation: 'mother', conditions: [{ ...breast(70), code: 'ovarian' }] }));
    expect(preview.status).toBe('refused');
    expect(preview.problem).toMatch(/has not reached yet/);
    expect(pedigree).toBe(sample);
  });

  it('refuses a third biological parent with a plain reason', () => {
    const sample = createSamplePedigree();
    const mother = sample.persons.mother;
    if (!mother) throw new Error('no mother');
    // Two biological parents, neither recorded as female: a mother cannot be added.
    const motherUnknown = { ...sample, persons: { ...sample.persons, mother: { ...mother, sex: 'male' as const } } };
    const { preview } = planEntry(motherUnknown, entry({ relation: 'mother' }));
    expect(preview.status).toBe('refused');
    expect(preview.problem).toMatch(/two biological parents/);
  });

  it('never changes the input tree', () => {
    const sample = deepFreeze(createSamplePedigree());
    const parsed = parseOffline('My mum had ovarian cancer at 50. My cousin had bowel cancer.');
    expect(() => resolveEntries(sample, parsed.entries, { e2: { side: 'maternal' } })).not.toThrow();
  });
});
