export type MathScope = Record<string, unknown>;

export interface MathInstance {
  evaluate: (expr: string, scope?: MathScope) => unknown;
}

export type MathDisplayObject = {
  isUnit?: boolean;
  isComplex?: boolean;
  isFraction?: boolean;
  toString: () => string;
};

export interface Result {
  text: string;
  value: number | null;
}

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
