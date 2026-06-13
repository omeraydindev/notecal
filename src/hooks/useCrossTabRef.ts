import { useRef, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { MathScope, NoteTab } from '../types';
import { processLines } from '../evalUtils';
import { mathAtom } from '../store';

export function useCrossTabRef(tabs: NoteTab[]) {
  const math = useAtomValue(mathAtom);
  const tabScopesRef = useRef<Record<string, MathScope>>({});
  const evaluatingTabsSet = useRef(new Set<string>());
  const tabLastModifiedRef = useRef<Record<string, number>>({});

  const tabsContentKey = useMemo(
    () => tabs.map((t) => `${t.id}:${t.lastModified}`).join('|'),
    [tabs],
  );

  const resolveRef = (tabName: string, varName: string): unknown => {
    if (!math) return NaN;

    let tabScope = tabScopesRef.current[tabName];
    if (!tabScope) {
      const tab = tabs.find(t => t.title === tabName);
      if (tab) {
        if (evaluatingTabsSet.current.has(tabName)) {
          return NaN;
        }
        evaluatingTabsSet.current.add(tabName);

        const scope: MathScope = { ref: resolveRef };
        processLines(tab.text.split('\n'), scope, math);

        evaluatingTabsSet.current.delete(tabName);
        tabScope = scope;
        tabScopesRef.current[tabName] = tabScope;
      }
    }
    if (!tabScope) return NaN;
    const val = tabScope[varName];
    if (val == null || typeof val === 'function') return NaN;
    return val;
  };

  return { resolveRef, tabsContentKey, tabScopesRef, tabLastModifiedRef };
}
