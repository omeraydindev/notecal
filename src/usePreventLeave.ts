import { useEffect } from 'react';

export default function usePreventLeave(block: boolean = true): void {
  function preventCloseAndRefresh(event: BeforeUnloadEvent): string {
    const e = event || window.event;
    e.preventDefault();
    if (e) e.returnValue = '';
    return '';
  }

  useEffect(() => {
    if (block) {
      window.addEventListener('beforeunload', preventCloseAndRefresh);
      window.addEventListener('unload', preventCloseAndRefresh);
    }
    return () => {
      window.removeEventListener('beforeunload', preventCloseAndRefresh);
      window.removeEventListener('unload', preventCloseAndRefresh);
    };
  }, [block]);
}
