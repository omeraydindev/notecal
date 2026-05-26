export interface NoteTab {
  id: string;
  title: string;
  text: string;
  lastModified: number;
}

export interface StoredTabsState {
  tabs: NoteTab[];
  activeTabId: string;
  updatedAt: number;
}
