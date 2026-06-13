import { useState, useRef, useMemo, useCallback, type RefObject } from 'react';
import { EditorView } from '@codemirror/view';
import type { MathScope, Result } from '../types';
import { math } from '../constants';
import { isMathDisplayObject, formatNumber, resolveLineReferences, stripComments } from '../evalUtils';

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

  const evaluateExpression = (expr: string, currentLineIdx?: number): string | null => {
    const { expr: uncommentedExpr } = stripComments(expr);
    if (!uncommentedExpr) return null;

    let processedExpr = uncommentedExpr;

    if (currentLineIdx !== undefined) {
      processedExpr = resolveLineReferences(processedExpr, currentLineIdx, results);
    }

    processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)([kmb])\b/gi, (_match, num, suffix) => {
      const multipliers: { [key: string]: number } = { k: 1e3, m: 1e6, b: 1e9 };
      return `(${num} * ${multipliers[suffix.toLowerCase()]})`;
    });

    if (processedExpr.includes('$')) return null;

    try {
      const res = math.evaluate(processedExpr, scopeRef.current);

      if (res === undefined || res === null || typeof res === 'function') {
        return null;
      }

      if (typeof res === 'number') {
        return formatNumber(res);
      }

      if (isMathDisplayObject(res)) {
        return res.toString();
      }

      return null;
    } catch {
      return null;
    }
  };

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

      const result = evaluateExpression(selectedText, lineNumber - 1);

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
