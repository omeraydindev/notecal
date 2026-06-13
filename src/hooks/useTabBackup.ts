import { useCallback } from 'react';
import type { StoredTabsState } from '../types';
import { normalizeTabsState } from '../tabUtils';

export function useTabBackup(
  tabsState: StoredTabsState,
  setTabsState: (state: StoredTabsState) => void,
  setIsOverflowOpen: (open: boolean) => void,
) {
  const exportTabs = useCallback(() => {
    const blob = new Blob([JSON.stringify(tabsState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notecal-tabs.json';
    a.click();
    URL.revokeObjectURL(url);
    setIsOverflowOpen(false);
  }, [tabsState, setIsOverflowOpen]);

  const importTabs = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          const normalized = normalizeTabsState(data);
          if (normalized) {
            setTabsState(normalized);
          } else {
            alert('Invalid file format.');
          }
        } catch {
          alert('Could not parse file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
    setIsOverflowOpen(false);
  }, [setTabsState, setIsOverflowOpen]);

  return { exportTabs, importTabs };
}
