import { useState, useEffect, useCallback, useMemo, type RefObject } from 'react';
import type { Result } from '../types';

export function useVisualLineCounts(
  wordWrap: boolean,
  lineHeight: number,
  editorRef: RefObject<HTMLDivElement | null>,
  results: Result[],
): Result[] {
  const [visualLineCounts, setVisualLineCounts] = useState<number[]>([]);

  const updateVisualLineCounts = useCallback(() => {
    if (!wordWrap) {
      setVisualLineCounts([]);
      return;
    }
    const editorContainer = editorRef.current;
    if (!editorContainer) return;
    const scroller = editorContainer.querySelector('.cm-scroller');
    if (!scroller) return;
    const cmLines = scroller.querySelectorAll('.cm-line');
    const counts: number[] = [];
    cmLines.forEach((lineEl) => {
      const height = lineEl.getBoundingClientRect().height;
      const count = Math.max(1, Math.round(height / lineHeight));
      counts.push(count);
    });
    setVisualLineCounts(counts);
  }, [wordWrap, lineHeight, editorRef]);

  useEffect(() => {
    const scroller = editorRef.current?.querySelector('.cm-scroller');
    if (!scroller) return;

    const resizeObserver = new ResizeObserver(() => {
      updateVisualLineCounts();
    });

    resizeObserver.observe(scroller);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateVisualLineCounts, editorRef]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-count visual lines when eval results change
    updateVisualLineCounts();
  }, [results, updateVisualLineCounts]);

  return useMemo(() => {
    if (!wordWrap || visualLineCounts.length === 0) return results;
    const expanded: Result[] = [];
    results.forEach((res, i) => {
      const count = visualLineCounts[i] || 1;
      expanded.push(res);
      for (let j = 1; j < count; j++) {
        expanded.push({ text: '', value: null });
      }
    });
    return expanded;
  }, [results, wordWrap, visualLineCounts]);
}
