import {
  addPerson,
  createPedigree,
  createSamplePedigree,
  deserialize,
  removePerson,
  serialize,
  updatePerson,
} from '../../../src/domain';
import {
  HISTORY_LIMIT,
  STORAGE_KEY,
  createPedigreeStore,
  selectCanRedo,
  selectCanUndo,
  selectRelatives,
  selectValidation,
} from '../../../src/state/store';
import type { KeyValueStorage } from '../../../src/state/store';

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded');
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function setup(stored?: string) {
  const storage = new MemoryStorage();
  if (stored !== undefined) storage.items.set(STORAGE_KEY, stored);
  const store = createPedigreeStore(storage);
  return { storage, store, state: () => store.getState() };
}

describe('pedigree store', () => {
  it('starts with a lone proband when nothing is stored, and stores nothing yet', () => {
    const { storage, state } = setup();
    expect(state().pedigree).toEqual(createPedigree());
    expect(state()).toMatchObject({ past: [], future: [], lastError: null, loadErrors: [] });
    expect(storage.items.size).toBe(0);
  });

  it('applies a mutation, records history and autosaves under the versioned key', () => {
    const { storage, state } = setup();
    const result = state().apply((ped) => addPerson(ped, { displayName: 'Aunt' }));
    expect(result.ok).toBe(true);
    expect(Object.keys(state().pedigree.persons)).toEqual(['p1', 'p2']);
    expect(state().past).toHaveLength(1);
    expect(STORAGE_KEY).toBe('kintrace.pedigree.v1');
    expect(deserialize(storage.getItem(STORAGE_KEY))).toEqual({ ok: true, pedigree: state().pedigree });
  });

  it('keeps the pedigree and history unchanged when a mutation is refused', () => {
    const { storage, state } = setup();
    const before = state().pedigree;
    const result = state().apply((ped) => removePerson(ped, 'p1'));
    expect(result.ok).toBe(false);
    expect(state().pedigree).toBe(before);
    expect(state().past).toEqual([]);
    expect(state().lastError).toMatchObject({ code: 'cannot_remove_proband' });
    expect(storage.items.size).toBe(0);
  });

  it('clears the last error on the next successful change', () => {
    const { state } = setup();
    state().apply((ped) => removePerson(ped, 'p1'));
    state().apply((ped) => addPerson(ped));
    expect(state().lastError).toBeNull();
  });

  it('undo then redo returns the identical pedigree', () => {
    const { storage, state } = setup();
    state().replace(createSamplePedigree());
    const before = state().pedigree;
    state().apply((ped) => updatePerson(ped, 'mother', { ageNow: 61 }));
    const after = state().pedigree;

    state().undo();
    expect(state().pedigree).toBe(before);
    expect(state().pedigree).toEqual(createSamplePedigree());
    expect(deserialize(storage.getItem(STORAGE_KEY))).toEqual({ ok: true, pedigree: before });

    state().redo();
    expect(state().pedigree).toBe(after);
    expect(deserialize(storage.getItem(STORAGE_KEY))).toEqual({ ok: true, pedigree: after });
  });

  it('does nothing on undo or redo when there is nothing to undo or redo', () => {
    const { state } = setup();
    const before = state().pedigree;
    state().undo();
    state().redo();
    expect(state().pedigree).toBe(before);
    expect([selectCanUndo(state()), selectCanRedo(state())]).toEqual([false, false]);
  });

  it('drops the redo stack when a new change is made after an undo', () => {
    const { state } = setup();
    state().apply((ped) => addPerson(ped));
    state().undo();
    expect(selectCanRedo(state())).toBe(true);
    state().apply((ped) => addPerson(ped, { displayName: 'Other' }));
    expect(selectCanRedo(state())).toBe(false);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    const { state } = setup();
    for (let n = 0; n < HISTORY_LIMIT + 5; n += 1) state().apply((ped) => addPerson(ped));
    expect(HISTORY_LIMIT).toBe(50);
    expect(state().past).toHaveLength(50);
    for (let n = 0; n < HISTORY_LIMIT + 5; n += 1) state().undo();
    // 55 people were added and 50 undone: the first 5 additions can no longer be undone.
    expect(Object.keys(state().pedigree.persons)).toHaveLength(6);
  });

  it('loads a stored pedigree at start-up', () => {
    const { state } = setup(serialize(createSamplePedigree()));
    expect(state().pedigree).toEqual(createSamplePedigree());
    expect(state().loadErrors).toEqual([]);
  });

  it('starts empty and reports why when the stored data is corrupt', () => {
    const { state } = setup('{"version":1,"persons":"oops"}');
    expect(state().pedigree).toEqual(createPedigree());
    expect(state().loadErrors.length).toBeGreaterThan(0);
  });

  it('clearAll erases the pedigree, the history and the stored copy', () => {
    const { storage, state } = setup(serialize(createSamplePedigree()));
    state().apply((ped) => updatePerson(ped, 'mother', { ageNow: 61 }));
    state().undo();
    state().clearAll();
    expect(state().pedigree).toEqual(createPedigree());
    expect(state()).toMatchObject({ past: [], future: [], lastError: null, saveFailed: false });
    expect(storage.items.size).toBe(0);
    state().undo();
    expect(state().pedigree).toEqual(createPedigree());
  });

  it('flags a failed autosave instead of throwing, and keeps the change in memory', () => {
    const { storage, state } = setup();
    storage.failWrites = true;
    expect(() => state().apply((ped) => addPerson(ped))).not.toThrow();
    expect(state().saveFailed).toBe(true);
    expect(Object.keys(state().pedigree.persons)).toHaveLength(2);
    storage.failWrites = false;
    state().apply((ped) => addPerson(ped));
    expect(state().saveFailed).toBe(false);
  });

  it('works without any storage at all', () => {
    const store = createPedigreeStore(null);
    store.getState().apply((ped) => addPerson(ped));
    store.getState().clearAll();
    expect(store.getState()).toMatchObject({ saveFailed: false, past: [] });
  });

  it('survives storage that throws on every call', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createPedigreeStore(broken);
    expect(store.getState().pedigree).toEqual(createPedigree());
    store.getState().clearAll();
    expect(store.getState().saveFailed).toBe(true);
  });
});

describe('store selectors', () => {
  it('selects the relatives of the proband, reusing the result for the same pedigree', () => {
    const { state } = setup(serialize(createSamplePedigree()));
    const relatives = selectRelatives(state());
    expect(relatives).toHaveLength(9);
    expect(selectRelatives(state())).toBe(relatives);
    state().apply((ped) => removePerson(ped, 'sister'));
    expect(selectRelatives(state())).toHaveLength(8);
  });

  it('selects validation issues, per reference year, reusing the result', () => {
    const { state } = setup(serialize(createSamplePedigree()));
    expect(selectValidation(state())).toEqual([]);
    expect(selectValidation(state())).toBe(selectValidation(state()));
    state().apply((ped) => updatePerson(ped, 'mother', { ageNow: null, birthYear: 1990 }));
    expect(selectValidation(state())).toEqual([]);
    expect(selectValidation(state(), 2020).map((issue) => issue.code)).toEqual([
      'onset_after_current_age',
    ]);
  });
});
