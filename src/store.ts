import { atomWithStorage } from 'jotai/utils';
import type { StoredTabsState } from './types';
import { TABS_STORAGE_KEY, INITIAL_TEXT } from './constants';
import { createTab } from './tabUtils';

const defaultTabsState = (): StoredTabsState => {
  const tab = createTab(INITIAL_TEXT, 'New Note');
  return { tabs: [tab], activeTabId: tab.id, updatedAt: Date.now() };
};

export const tabsAtom = atomWithStorage<StoredTabsState>(TABS_STORAGE_KEY, defaultTabsState());
