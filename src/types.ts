export type MathScope = Record<string, unknown>;

export interface MathInstance {
  evaluate: (expr: string, scope?: MathScope) => unknown;
  createUnit: (name: string, options?: { definition?: string; aliases?: string[] }) => void;
  help?: (...args: unknown[]) => Record<string, string>;
  Unit?: { UNITS: Record<string, { name: string }> };
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
