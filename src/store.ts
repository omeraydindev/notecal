import { atomWithStorage, createJSONStorage, unstable_withStorageValidator as withStorageValidator } from 'jotai/utils';
import { atom } from 'jotai';
import type { StoredTabsState, MathInstance } from './types';
import { TABS_STORAGE_KEY, INITIAL_TEXT } from './constants';
import { createTab, normalizeTabsState } from './tabUtils';

const isValidTabsState = (v: unknown): v is StoredTabsState =>
  normalizeTabsState(v) !== null;

const defaultTabsState = (): StoredTabsState => {
  const tab = createTab(INITIAL_TEXT, 'New Note');
  return { tabs: [tab], activeTabId: tab.id, updatedAt: Date.now() };
};

export const tabsAtom = atomWithStorage<StoredTabsState>(
  TABS_STORAGE_KEY,
  defaultTabsState(),
  withStorageValidator(isValidTabsState)(createJSONStorage(() => localStorage)),
  { getOnInit: true },
);

const defaultFontSize = typeof window !== 'undefined' && window.innerWidth < 768 ? 12 : 16;

const isValidFontSize = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v) && v >= 10 && v <= 32;

export const fontSizeAtom = atomWithStorage<number>(
  'notecal-fontSize',
  defaultFontSize,
  withStorageValidator(isValidFontSize)(createJSONStorage(() => localStorage)),
  { getOnInit: true },
);

export const wordWrapAtom = atomWithStorage<boolean>('notecal-wordWrap', false, undefined, { getOnInit: true });

export const mathAtom = atom<MathInstance | null>(null);
