import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import {
  createPedigree,
  deserialize,
  relativesOf,
  serialize,
  validatePedigree,
} from '../domain';
import type { MutationError, MutationResult, Pedigree, Relative, ValidationIssue } from '../domain';

/** The version in the key matches the stored schema generation. */
export const STORAGE_KEY = 'kintrace.pedigree.v1';
export const HISTORY_LIMIT = 50;

/** The part of Web Storage the store needs; injectable for tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PedigreeState {
  pedigree: Pedigree;
  /** Earlier pedigrees, oldest first, at most HISTORY_LIMIT. */
  past: Pedigree[];
  /** Undone pedigrees, next redo first. */
  future: Pedigree[];
  /** Why the last change was refused, or null if it was applied. */
  lastError: MutationError | null;
  /** True when the last autosave could not be written (storage full or blocked). */
  saveFailed: boolean;
  /** Why stored data could not be loaded at start-up; empty when it loaded or none existed. */
  loadErrors: string[];
  /** False until a tree is loaded, started or imported; false again after clearAll. */
  started: boolean;
  /** True when this browser blocks storage: the tree lasts only while the tab is open. */
  storageBlocked: boolean;
  /**
   * True when another tab saved a different tree. Saving here is paused until
   * the user chooses, so neither tab silently overwrites the other.
   */
  otherTabChanged: boolean;
  /** Loads the tree another tab saved, replacing this tab's tree and its undo history. */
  reloadFromStorage(): void;
  /** Keeps this tab's tree and saves it over the other tab's. */
  keepThisTab(): void;
  /** Told by the browser that storage changed in another tab. */
  noticeStorageChange(key: string | null, newValue: string | null): void;
  /** Runs a domain mutation; on success it becomes the current pedigree and can be undone. */
  apply(mutation: (pedigree: Pedigree) => MutationResult): MutationResult;
  /** Swaps in a whole pedigree (sample or import) as one undoable step. */
  replace(pedigree: Pedigree): void;
  undo(): void;
  redo(): void;
  /** Erases the pedigree, the undo history and the stored copy. Cannot be undone. */
  clearAll(): void;
}

/** JSON with object keys sorted, so two copies of one tree compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

/** Whether stored text holds the same tree as this one (a reload reorders keys, nothing else). */
function sameTree(stored: string, pedigree: Pedigree): boolean {
  if (stored === serialize(pedigree)) return true;
  const loaded = deserialize(stored);
  return loaded.ok && canonical(loaded.pedigree) === canonical(pedigree);
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading the property itself throws when the browser blocks storage.
    return null;
  }
}

function load(
  storage: KeyValueStorage | null,
): Pick<PedigreeState, 'pedigree' | 'loadErrors' | 'started'> {
  const read = (): string | null => {
    try {
      return storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const stored = read();
  if (stored === null) return { pedigree: createPedigree(), loadErrors: [], started: false };
  const result = deserialize(stored);
  return result.ok
    ? { pedigree: result.pedigree, loadErrors: [], started: true }
    : { pedigree: createPedigree(), loadErrors: result.errors, started: false };
}

export function createPedigreeStore(
  storage: KeyValueStorage | null = defaultStorage(),
): StoreApi<PedigreeState> {
  /** Returns true when the save failed. Family data is never logged, so no detail is kept. */
  const saveFails = (pedigree: Pedigree): boolean => {
    try {
      storage?.setItem(STORAGE_KEY, serialize(pedigree));
      return false;
    } catch {
      return true;
    }
  };

  return createStore<PedigreeState>()((set, get) => {
    /** Saves unless another tab's change is waiting for the user's choice. */
    const persist = (pedigree: Pedigree): boolean =>
      get().otherTabChanged ? get().saveFailed : saveFails(pedigree);

    const commit = (pedigree: Pedigree) => {
      const { pedigree: previous, past } = get();
      set({
        pedigree,
        past: [...past, previous].slice(-HISTORY_LIMIT),
        future: [],
        lastError: null,
        saveFailed: persist(pedigree),
        started: true,
      });
    };

    const reloadFromStorage = () => {
      set({ ...load(storage), past: [], future: [], lastError: null, saveFailed: false, otherTabChanged: false });
    };

    return {
      ...load(storage),
      past: [],
      future: [],
      lastError: null,
      saveFailed: false,
      storageBlocked: storage === null,
      otherTabChanged: false,

      reloadFromStorage,

      keepThisTab() {
        set({ otherTabChanged: false, saveFailed: saveFails(get().pedigree) });
      },

      noticeStorageChange(key, newValue) {
        // A null key means the other tab cleared all of this site's storage.
        if (key !== null && key !== STORAGE_KEY) return;
        const { pedigree, started, past } = get();
        if (newValue !== null && sameTree(newValue, pedigree)) return;
        // Nothing here to lose yet: take the other tab's tree straight away.
        if (!started && past.length === 0) reloadFromStorage();
        else set({ otherTabChanged: true });
      },

      apply(mutation) {
        const result = mutation(get().pedigree);
        if (result.ok) commit(result.pedigree);
        else set({ lastError: result.error });
        return result;
      },

      replace(pedigree) {
        commit(pedigree);
      },

      undo() {
        const { pedigree, past, future } = get();
        const previous = past[past.length - 1];
        if (previous === undefined) return;
        set({
          pedigree: previous,
          past: past.slice(0, -1),
          future: [pedigree, ...future],
          lastError: null,
          saveFailed: persist(previous),
        });
      },

      redo() {
        const { pedigree, past, future } = get();
        const next = future[0];
        if (next === undefined) return;
        set({
          pedigree: next,
          past: [...past, pedigree].slice(-HISTORY_LIMIT),
          future: future.slice(1),
          lastError: null,
          saveFailed: persist(next),
        });
      },

      clearAll() {
        let removeFailed = false;
        try {
          storage?.removeItem(STORAGE_KEY);
        } catch {
          removeFailed = true;
        }
        // History goes too: "clear everything" must not be recoverable with undo.
        set({
          pedigree: createPedigree(),
          past: [],
          future: [],
          lastError: null,
          saveFailed: removeFailed,
          loadErrors: [],
          started: false,
          otherTabChanged: false,
        });
      },
    };
  });
}

// Selectors return the same array for the same pedigree object, so React
// subscribers do not re-render (or loop) on unrelated state changes.
const relativesCache = new WeakMap<Pedigree, Relative[]>();
const validationCache = new WeakMap<Pedigree, Map<number | undefined, ValidationIssue[]>>();

/** Blood relatives of the proband up to third degree. */
export function selectRelatives(state: PedigreeState): Relative[] {
  let relatives = relativesCache.get(state.pedigree);
  if (!relatives) {
    relatives = relativesOf(state.pedigree, state.pedigree.probandId, 3);
    relativesCache.set(state.pedigree, relatives);
  }
  return relatives;
}

/** Validation issues for the current pedigree. Pass the current year to use birth years. */
export function selectValidation(state: PedigreeState, referenceYear?: number): ValidationIssue[] {
  let byYear = validationCache.get(state.pedigree);
  if (!byYear) {
    byYear = new Map();
    validationCache.set(state.pedigree, byYear);
  }
  let issues = byYear.get(referenceYear);
  if (!issues) {
    issues = validatePedigree(
      state.pedigree,
      referenceYear === undefined ? {} : { referenceYear },
    );
    byYear.set(referenceYear, issues);
  }
  return issues;
}

export const selectCanUndo = (state: PedigreeState): boolean => state.past.length > 0;
export const selectCanRedo = (state: PedigreeState): boolean => state.future.length > 0;

/** The app's single pedigree store. */
export const pedigreeStore = createPedigreeStore();

/**
 * Listens for another tab changing the saved tree, so this tab can say so
 * instead of silently overwriting it on its next save. Returns a function
 * that stops listening.
 */
export function watchOtherTabs(
  store: StoreApi<PedigreeState> = pedigreeStore,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onStorage = (event: StorageEvent) => store.getState().noticeStorageChange(event.key, event.newValue);
  target.addEventListener('storage', onStorage);
  return () => target.removeEventListener('storage', onStorage);
}

export function usePedigreeStore<T>(selector: (state: PedigreeState) => T): T {
  return useStore(pedigreeStore, selector);
}
