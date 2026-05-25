export interface NoteTab {
  id: string;
  title: string;
  text: string;
}

export interface StoredTabsState {
  tabs: NoteTab[];
  activeTabId: string;
}
