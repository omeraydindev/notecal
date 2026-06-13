import type { NoteTab, StoredTabsState } from './types';

export const createTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const getDefaultTabTitle = (index: number) => {
  return index === 0 ? 'New Note' : `New Note (${index + 1})`;
};

export const createTab = (text = '', title = 'New Note'): NoteTab => ({
  id: createTabId(),
  title,
  text,
  lastModified: Date.now(),
});

export const normalizeTab = (tab: unknown, index: number): NoteTab | null => {
  if (!tab || typeof tab !== 'object') return null;
  const candidate = tab as Partial<NoteTab>;
  if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string') return null;

  return {
    id: candidate.id,
    title: typeof candidate.title === 'string' && candidate.title.trim()
      ? candidate.title.trim()
      : getDefaultTabTitle(index),
    text: candidate.text,
    lastModified: typeof candidate.lastModified === 'number' ? candidate.lastModified : 0,
  };
};

export const normalizeTabsState = (state: unknown): StoredTabsState | null => {
  if (!state || typeof state !== 'object') return null;

  const candidate = state as Partial<StoredTabsState>;
  if (!Array.isArray(candidate.tabs)) return null;

  const tabs = candidate.tabs
    .map((tab, index) => normalizeTab(tab, index))
    .filter((tab): tab is NoteTab => tab !== null);
  if (tabs.length === 0) return null;

  const activeTabId = tabs.some((tab) => tab.id === candidate.activeTabId)
    ? (candidate.activeTabId as string)
    : tabs[0].id;

  return {
    tabs,
    activeTabId,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
  };
};

export const getNextNewNoteTitle = (tabs: NoteTab[]) => {
  const existingTitles = new Set(tabs.map((tab) => tab.title.trim()));
  if (!existingTitles.has('New Note')) return 'New Note';

  let index = 2;
  while (existingTitles.has(`New Note (${index})`)) {
    index += 1;
  }

  return `New Note (${index})`;
};
