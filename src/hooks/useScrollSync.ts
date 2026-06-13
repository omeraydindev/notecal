import { useEffect, type RefObject } from 'react';

export function useScrollSync(
  editorRef: RefObject<HTMLDivElement | null>,
  resultsRef: RefObject<HTMLDivElement | null>,
  activeTabId: string,
) {
  useEffect(() => {
    const editorContainer = editorRef.current;
    const resultsPanel = resultsRef.current;
    if (!editorContainer || !resultsPanel) return;

    const findAndAttachScroller = (): (() => void) | undefined => {
      const scroller = editorContainer.querySelector('.cm-scroller');
      if (!scroller) {
        setTimeout(findAndAttachScroller, 50);
        return;
      }

      const handleScroll = () => {
        if (resultsPanel.scrollTop !== scroller.scrollTop) {
          resultsPanel.scrollTop = scroller.scrollTop;
        }
      };

      scroller.addEventListener('scroll', handleScroll, { passive: true });
      return () => scroller.removeEventListener('scroll', handleScroll);
    };

    const cleanup = findAndAttachScroller();
    return () => {
      if (cleanup) cleanup();
    };
  }, [editorRef, resultsRef]);

  useEffect(() => {
    const scroller = editorRef.current?.querySelector('.cm-scroller');
    const resultsPanel = resultsRef.current;
    if (!scroller || !resultsPanel) return;

    resultsPanel.scrollTop = scroller.scrollTop;
  }, [activeTabId, editorRef, resultsRef]);
}
