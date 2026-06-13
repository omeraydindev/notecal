import { useState, useRef, useMemo, useCallback, type RefObject } from 'react';
import { EditorView } from '@codemirror/view';
import type { MathScope, Result } from '../types';
import { evaluateSingle } from '../evalUtils';

export interface PopupState {
  visible: boolean;
  x: number;
  y: number;
  result: string;
}

export function useSelectionPopup(
  results: Result[],
  scopeRef: RefObject<MathScope>,
) {
  const [popup, setPopup] = useState<PopupState>({ visible: false, x: 0, y: 0, result: '' });

  const clearPopup = useCallback(() => {
    setPopup({ visible: false, x: 0, y: 0, result: '' });
  }, []);

  const handleSelectionChange = (view: EditorView) => {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);

    if (selectedText && selection.from !== selection.to) {
      if (selectedText.includes('\n')) {
        setPopup({ visible: false, x: 0, y: 0, result: '' });
        return;
      }

      const isPlainNumber = /^-?\d+(\.\d+)?$/.test(selectedText.trim());
      if (isPlainNumber) {
        setPopup({ visible: false, x: 0, y: 0, result: '' });
        return;
      }

      const lineNumber = view.state.doc.lineAt(selection.from).number;

      const result = evaluateSingle(selectedText, scopeRef.current, lineNumber - 1, results).text || null;

      if (result) {
        const coords = view.coordsAtPos(selection.to);
        if (coords) {
          setPopup({
            visible: true,
            x: coords.left,
            y: coords.bottom + 8,
            result: result,
          });
        }
      } else {
        setPopup({ visible: false, x: 0, y: 0, result: '' });
      }
    } else {
      setPopup({ visible: false, x: 0, y: 0, result: '' });
    }
  };

  const handleSelectionChangeRef = useRef(handleSelectionChange);
  // eslint-disable-next-line react-hooks/refs -- stable ref pattern, read only inside CodeMirror callback
  handleSelectionChangeRef.current = handleSelectionChange;

  // eslint-disable-next-line react-hooks/refs -- ref read only inside CodeMirror's async update callback
  const selectionExtension = useMemo(() => EditorView.updateListener.of((update) => {
    if (update.selectionSet && update.view) {
      handleSelectionChangeRef.current(update.view);
    }
  }), []);

  return { popup, clearPopup, selectionExtension };
}
