import { useRef, useMemo, type RefObject } from 'react';
import type { MathScope, NoteTab } from '../types';
import { processLines } from '../evalUtils';

export function useCrossTabRef(
  tabs: NoteTab[],
  scopeRef: RefObject<MathScope>,
) {
  const tabScopesRef = useRef<Record<string, MathScope>>({});
  const evaluatingTabsSet = useRef(new Set<string>());
  const tabLastModifiedRef = useRef<Record<string, number>>({});

  const tabsContentKey = useMemo(
    () => tabs.map((t) => `${t.id}:${t.lastModified}`).join('|'),
    [tabs],
  );

  const resolveRef = (tabName: string, varName: string): number => {
    let tabScope = tabScopesRef.current[tabName];
    if (!tabScope) {
      const tab = tabs.find(t => t.title === tabName);
      if (tab) {
        if (evaluatingTabsSet.current.has(tabName)) {
          return NaN;
        }
        evaluatingTabsSet.current.add(tabName);

        const currencyFunctions = Object.fromEntries(
          Object.entries(scopeRef.current).filter(([, v]) => typeof v === 'function')
        );
        const scope: MathScope = { ...currencyFunctions, ref: resolveRef };
        processLines(tab.text.split('\n'), scope);

        evaluatingTabsSet.current.delete(tabName);
        tabScope = scope;
        tabScopesRef.current[tabName] = tabScope;
      }
    }
    if (!tabScope) return NaN;
    const val = tabScope[varName];
    return typeof val === 'number' ? val : NaN;
  };

  return { resolveRef, tabsContentKey, tabScopesRef, tabLastModifiedRef };
}
