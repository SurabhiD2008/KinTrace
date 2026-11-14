import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { listGuidelines } from '../guidelines';

/** View choices shared between pages. Holds no family data and is not saved. */
export interface UiState {
  /** The guideline profile chosen in the builder toolbar. */
  guidelineId: string;
  setGuidelineId(id: string): void;
}

export const uiStore = createStore<UiState>()((set) => ({
  guidelineId: listGuidelines()[0]?.id ?? '',
  setGuidelineId(id) {
    if (listGuidelines().some((guideline) => guideline.id === id)) set({ guidelineId: id });
  },
}));

export function useUiStore<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}
