import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { addChild, createSamplePedigree, serialize } from '../../../src/domain';
import { STORAGE_KEY, createPedigreeStore, pedigreeStore, watchOtherTabs } from '../../../src/state/store';
import type { KeyValueStorage } from '../../../src/state/store';
import { Shell } from '../../../src/ui/Shell';

// Two tabs must never silently overwrite each other's tree, and storage that cannot
// be used must be said on every page, never hidden behind "saved on this device".

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      Reflect.deleteProperty(data, key);
    },
  };
}

describe('another tab changes the saved tree', () => {
  it('a tab with a tree pauses saving and asks, instead of overwriting the other tab', () => {
    const shared = memoryStorage();
    const tabA = createPedigreeStore(shared);
    const tabB = createPedigreeStore(shared);
    tabA.getState().replace(createSamplePedigree());
    tabB.getState().replace(createSamplePedigree());

    // Tab A adds someone; tab B hears about it.
    expect(tabA.getState().apply((ped) => addChild(ped, 'proband', { sex: 'male' })).ok).toBe(true);
    const fromA = shared.data[STORAGE_KEY] ?? '';
    tabB.getState().noticeStorageChange(STORAGE_KEY, fromA);
    expect(tabB.getState().otherTabChanged).toBe(true);

    // Tab B keeps editing: its edits stay on screen but do not overwrite tab A's save.
    expect(tabB.getState().apply((ped) => addChild(ped, 'proband', { sex: 'female' })).ok).toBe(true);
    tabB.getState().undo();
    tabB.getState().redo();
    expect(shared.data[STORAGE_KEY]).toBe(fromA);

    // Reload takes tab A's tree.
    tabB.getState().reloadFromStorage();
    expect(tabB.getState().pedigree).toEqual(JSON.parse(fromA));
    expect(tabB.getState()).toMatchObject({ otherTabChanged: false, past: [], future: [] });
  });

  it('"keep this tab" saves this tab\'s tree over the other one', () => {
    const shared = memoryStorage();
    const tab = createPedigreeStore(shared);
    tab.getState().replace(createSamplePedigree());
    tab.getState().noticeStorageChange(STORAGE_KEY, '{"other":true}');
    tab.getState().keepThisTab();
    expect(tab.getState().otherTabChanged).toBe(false);
    expect(shared.data[STORAGE_KEY]).toBe(serialize(tab.getState().pedigree));
  });

  it('does not flag the same tree saved with its keys in another order', () => {
    const shared = memoryStorage();
    const tab = createPedigreeStore(shared);
    const sample = createSamplePedigree();
    tab.getState().replace(sample);
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(sample).reverse()));
    tab.getState().noticeStorageChange(STORAGE_KEY, reordered);
    expect(tab.getState().otherTabChanged).toBe(false);
  });

  it('ignores other keys, and a change that matches what this tab already has', () => {
    const shared = memoryStorage();
    const tab = createPedigreeStore(shared);
    tab.getState().replace(createSamplePedigree());
    tab.getState().noticeStorageChange('kintrace.locale.v1', 'es');
    tab.getState().noticeStorageChange(STORAGE_KEY, serialize(tab.getState().pedigree));
    expect(tab.getState().otherTabChanged).toBe(false);
  });

  it('a tab that has not started anything takes the other tab\'s tree straight away', () => {
    const shared = memoryStorage();
    const tab = createPedigreeStore(shared);
    shared.data[STORAGE_KEY] = serialize(createSamplePedigree());
    tab.getState().noticeStorageChange(STORAGE_KEY, shared.data[STORAGE_KEY] ?? null);
    expect(tab.getState()).toMatchObject({ started: true, otherTabChanged: false });
  });

  it('clearing everything in another tab is noticed too (key null or value null)', () => {
    const tab = createPedigreeStore(memoryStorage());
    tab.getState().replace(createSamplePedigree());
    tab.getState().noticeStorageChange(null, null);
    expect(tab.getState().otherTabChanged).toBe(true);
  });

  it('watchOtherTabs passes browser storage events to the store, and stops when asked', () => {
    const target = new EventTarget();
    const tab = createPedigreeStore(memoryStorage());
    tab.getState().replace(createSamplePedigree());
    const stop = watchOtherTabs(tab, target as unknown as Window);
    target.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: '{}' }));
    expect(tab.getState().otherTabChanged).toBe(true);
    tab.getState().keepThisTab();
    stop();
    target.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: '{}' }));
    expect(tab.getState().otherTabChanged).toBe(false);
  });
});

describe('storage that cannot be used', () => {
  it('a store without storage says so, and keeps working in memory', () => {
    const store = createPedigreeStore(null);
    expect(store.getState().storageBlocked).toBe(true);
    store.getState().replace(createSamplePedigree());
    expect(store.getState().started).toBe(true);
  });

  it('every page shows the notices, and the other-tab buttons work', async () => {
    const user = userEvent.setup();
    act(() => pedigreeStore.getState().replace(createSamplePedigree()));
    render(
      <MemoryRouter initialEntries={['/anywhere']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="*" element={<main>page</main>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => pedigreeStore.getState().noticeStorageChange(STORAGE_KEY, '{"version":1}'));
    expect(screen.getByRole('alert')).toHaveTextContent('Another tab changed this tree.');
    await user.click(screen.getByRole('button', { name: 'Keep this tab’s version' }));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => pedigreeStore.getState().clearAll());
  });
});
