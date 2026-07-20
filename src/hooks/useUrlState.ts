import { useMemo, useCallback } from 'react';
import { useQueryState } from 'nuqs';
import LZString from 'lz-string';
import type { StoredTabsState } from '../types';
import { normalizeTabsState } from '../tabUtils';

export function useUrlState() {
  const [encoded, setEncoded] = useQueryState('v');

  const decodedUrlState = useMemo(() => {
    if (!encoded) return null;
    try {
      const json = LZString.decompressFromEncodedURIComponent(encoded);
      if (!json) return null;
      return normalizeTabsState(JSON.parse(json));
    } catch {
      return null;
    }
  }, [encoded]);

  const buildShareUrl = useCallback((state: StoredTabsState) => {
    const json = JSON.stringify(state);
    const compressed = LZString.compressToEncodedURIComponent(json);
    const { origin, pathname } = window.location;
    return `${origin}${pathname}?v=${compressed}`;
  }, []);

  const clearUrlParam = useCallback(() => {
    setEncoded(null);
  }, [setEncoded]);

  return { decodedUrlState, buildShareUrl, clearUrlParam };
}
