import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import { Tooltip } from 'react-tooltip';
import { Calculator, Sun, Moon, Monitor, ZoomIn, ZoomOut, Plus, X, WrapText, MoreHorizontal, Download, Upload } from 'lucide-react';
import type { MathScope, MathDisplayObject, Result } from './types';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { mathLanguageExtension } from './mathLanguage';
import { mathDarkTheme, mathLightTheme } from './mathTheme';
import { math } from './constants';
import { createTab, normalizeTabsState, getNextNewNoteTitle } from './tabUtils';
import { tabsAtom, fontSizeAtom, wordWrapAtom } from './store';
import SortableTab from './components/SortableTab';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';

const isMathDisplayObject = (value: unknown): value is MathDisplayObject => (
  typeof value === 'object'
  && value !== null
  && ('isUnit' in value || 'isComplex' in value || 'isFraction' in value)
);


export default function App() {
  const [tabsState, setTabsState] = useAtom(tabsAtom);
  const { tabs, activeTabId } = tabsState;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const text = activeTab?.text ?? '';
  const [results, setResults] = useState<Result[]>([]);
  const [fontSize, setFontSize] = useAtom(fontSizeAtom);
  const [wordWrap, setWordWrap] = useAtom(wordWrapAtom);
  const [isRenamingTab, setIsRenamingTab] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  
  // Theme mode: 'device' follows system, 'light'/'dark' are explicit
  const [themeMode, setThemeMode] = useState<'device' | 'light' | 'dark'>('device');
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDarkMode = themeMode === 'device' ? systemDark : themeMode === 'dark';

  const cycleTheme = useCallback(() => {
    setThemeMode(prev => {
      if (prev === 'device') return 'light';
      if (prev === 'light') return 'dark';
      return 'device';
    });
  }, []);

  // Popup state for instant expression results
  const [popup, setPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    result: string;
  }>({ visible: false, x: 0, y: 0, result: '' });

  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef<MathScope>({});
  const tabScopesRef = useRef<Record<string, MathScope>>({});
  const currencyRates = useRef<Record<string, number>>({});
  const availableCurrencies = useRef<string[]>([]);
  const currencyFetchTriggered = useRef(false);
  const [currencyLoaded, setCurrencyLoaded] = useState(false);
  const [visualLineCounts, setVisualLineCounts] = useState<number[]>([]);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setIsOverflowOpen(false);
      }
    };
    if (isOverflowOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOverflowOpen]);

  const exportTabs = useCallback(() => {
    const blob = new Blob([JSON.stringify(tabsState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notecal-tabs.json';
    a.click();
    URL.revokeObjectURL(url);
    setIsOverflowOpen(false);
  }, [tabsState]);

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
  }, [setTabsState]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
    const newIndex = tabs.findIndex((tab) => tab.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      setTabsState((current) => ({
        ...current,
        tabs: arrayMove(current.tabs, oldIndex, newIndex),
      }));
    }
  };

  // Fetch currency rates only when a conversion function is used in text
  useEffect(() => {
    if (currencyFetchTriggered.current) return;

    const currencyPattern = /\b[a-z]{3}_to_[a-z]{3}\(\)/;
    if (!currencyPattern.test(text)) return;

    currencyFetchTriggered.current = true;

    const fetchCurrencyRates = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        
        if (data && data.rates) {
          const rates = { USD: 1, ...data.rates };
          const currencies = Object.keys(rates);
          
          currencyRates.current = rates;
          availableCurrencies.current = currencies;

          // Generate dynamic conversion functions
          const currencyFunctions: Record<string, () => number> = {};
          
          for (const from of currencies) {
            for (const to of currencies) {
              if (from !== to) {
                const fnName = `${from.toLowerCase()}_to_${to.toLowerCase()}`;
                currencyFunctions[fnName] = () => {
                  const fromRate = rates[from];
                  const toRate = rates[to];
                  return toRate / fromRate;
                };
              }
            }
          }

          // Add functions to scope
          Object.assign(scopeRef.current, currencyFunctions);
          setCurrencyLoaded(true);
        }
      } catch (error) {
        console.error('Failed to fetch currency rates:', error);
      }
    };

    fetchCurrencyRates();
  }, [text]);

  const formatNumber = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(num);
  };

  const resolveLineReferences = (expr: string, currentIdx: number, results: Result[]): string => {
    return expr.replace(/(?<!\w)\$(-?\d+)\b/g, (match, numStr) => {
      const target = parseInt(numStr, 10);
      let targetIdx: number;
      if (target > 0) {
        targetIdx = target - 1;
      } else if (target < 0) {
        targetIdx = currentIdx + target;
      } else {
        return match;
      }
      if (targetIdx >= 0 && targetIdx < currentIdx && results[targetIdx]?.value != null) {
        return String(results[targetIdx].value);
      }
      return match;
    });
  };

  const stripComments = (expr: string, isInBlockComment = false) => {
    let result = '';
    let index = 0;

    while (index < expr.length) {
      if (isInBlockComment) {
        const blockEnd = expr.indexOf('*/', index);
        if (blockEnd === -1) return { expr: result.trim(), isInBlockComment: true };
        index = blockEnd + 2;
        isInBlockComment = false;
        continue;
      }

      if (expr.startsWith('//', index)) break;

      if (expr.startsWith('/*', index)) {
        isInBlockComment = true;
        index += 2;
        continue;
      }

      result += expr[index];
      index += 1;
    }

    return { expr: result.trim(), isInBlockComment };
  };

  // Evaluate a single expression (for popup)
  const evaluateExpression = (expr: string, currentLineIdx?: number): string | null => {
    const { expr: uncommentedExpr } = stripComments(expr);
    if (!uncommentedExpr) return null;

    let processedExpr = uncommentedExpr;

    // Resolve line references if we know the current line
    if (currentLineIdx !== undefined) {
      processedExpr = resolveLineReferences(processedExpr, currentLineIdx, results);
    }

    // Process shorthand multipliers (k, m, b)
    processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)([kmb])\b/gi, (_match, num, suffix) => {
      const multipliers: { [key: string]: number } = { k: 1e3, m: 1e6, b: 1e9 };
      return `(${num} * ${multipliers[suffix.toLowerCase()]})`;
    });

    if (processedExpr.includes('$')) return null;

    try {
      // Use the current scope from main evaluation
      const res = math.evaluate(processedExpr, scopeRef.current);

      if (res === undefined || res === null || typeof res === 'function') {
        return null;
      }

      // Standard Numbers
      if (typeof res === 'number') {
        return formatNumber(res);
      }

      // Math.js specific objects (Units, Complex numbers, etc.)
      if (isMathDisplayObject(res)) {
        return res.toString();
      }

      return null;
    } catch {
      return null;
    }
  };

  // --- Shared evaluation helpers ---

  // Cycle detection for lazy cross-tab evaluation
  const evaluatingTabsSet = useRef(new Set<string>());

  // Resolve a cross-tab ref, lazily evaluating the referenced tab if needed
  const resolveRef = (tabName: string, varName: string): number => {
    let tabScope = tabScopesRef.current[tabName];
    if (!tabScope) {
      const tab = tabs.find(t => t.title === tabName);
      if (tab) {
        tabScope = evaluateTabContent(tabName, tab.text);
        tabScopesRef.current[tabName] = tabScope;
      }
    }
    if (!tabScope) return NaN;
    const val = tabScope[varName];
    return typeof val === 'number' ? val : NaN;
  };

  // Evaluate lines against a scope, mutating scope via assignments, returning results.
  // Used by both the main evaluation effect and lazy cross-tab evaluation.
  const processLines = (lines: string[], scope: MathScope): Result[] => {
    let isInBlockComment = false;
    const results: Result[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const strippedLine = stripComments(lines[idx], isInBlockComment);
      isInBlockComment = strippedLine.isInBlockComment;

      let expr = strippedLine.expr;
      if (!expr) {
        results.push({ text: '', value: null });
        continue;
      }

      expr = resolveLineReferences(expr, idx, results);
      expr = expr.replace(/(\d+(?:\.\d+)?)([kmb])\b/gi, (_match, num, suffix) => {
        const multipliers: { [key: string]: number } = { k: 1e3, m: 1e6, b: 1e9 };
        return `(${num} * ${multipliers[suffix.toLowerCase()]})`;
      });

      if (expr.includes('$')) {
        results.push({ text: '', value: null });
        continue;
      }

      try {
        const res = math.evaluate(expr, scope);

        if (res === undefined || res === null || typeof res === 'function') {
          results.push({ text: '', value: null });
          continue;
        }

        if (typeof res === 'number') {
          results.push({ text: formatNumber(res), value: res });
          continue;
        }

        if (isMathDisplayObject(res)) {
          results.push({ text: res.toString(), value: null });
          continue;
        }

        results.push({ text: '', value: null });
      } catch {
        results.push({ text: '', value: null });
      }
    }

    return results;
  };

  // Evaluate a tab's text to build its scope (used for lazy cross-tab ref resolution)
  const evaluateTabContent = (tabName: string, tabText: string): MathScope => {
    if (evaluatingTabsSet.current.has(tabName)) return {};
    evaluatingTabsSet.current.add(tabName);

    const currencyFunctions = Object.fromEntries(
      Object.entries(scopeRef.current).filter(([, v]) => typeof v === 'function')
    );
    const scope: MathScope = { ...currencyFunctions, ref: resolveRef };
    processLines(tabText.split('\n'), scope);

    evaluatingTabsSet.current.delete(tabName);
    return scope;
  };

  // Track lastModified per tab to detect stale cross-tab ref() caches
  const tabLastModifiedRef = useRef<Record<string, number>>({});

  // Hash of all tab contents — changes when any tab's text or lastModified changes,
  // ensuring the eval effect re-runs for cross-tab ref() after import.
  const tabsContentKey = useMemo(
    () => tabs.map((t) => `${t.id}:${t.lastModified}`).join('|'),
    [tabs],
  );

  // Evaluate text line by line whenever it changes
  useEffect(() => {
    // Invalidate cached scopes for tabs whose content changed since last evaluation
    for (const tab of tabs) {
      const prev = tabLastModifiedRef.current[tab.id];
      if (prev !== undefined && prev !== tab.lastModified) {
        delete tabScopesRef.current[tab.title];
      }
      tabLastModifiedRef.current[tab.id] = tab.lastModified;
    }

    const currencyFunctions = Object.fromEntries(
      Object.entries(scopeRef.current).filter(([, v]) => typeof v === 'function')
    );
    const scope: MathScope = { ...currencyFunctions, ref: resolveRef };
    const newResults = processLines(text.split('\n'), scope);

    setResults(newResults);
    scopeRef.current = { ...scope, ref: resolveRef }; // Store scope for popup evaluation (keep ref)
    tabScopesRef.current[activeTab.title] = { ...scope };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, currencyLoaded, activeTab.title, tabsContentKey]);

  // Synchronize vertical scrolling via native DOM synchronously to prevent lag
  useEffect(() => {
    const editorContainer = editorRef.current;
    const resultsPanel = resultsRef.current;
    if (!editorContainer || !resultsPanel) return;

    // Find the CodeMirror scroller element - retry if not found yet
    const findAndAttachScroller = () => {
      const scroller = editorContainer.querySelector('.cm-scroller');
      if (!scroller) {
        // CodeMirror not ready yet, try again
        setTimeout(findAndAttachScroller, 50);
        return;
      }

      const handleScroll = () => {
        // Direct, synchronous update. requestAnimationFrame adds a 1-frame lag
        // which causes visual tearing during fast scrolling.
        if (resultsPanel.scrollTop !== scroller.scrollTop) {
          resultsPanel.scrollTop = scroller.scrollTop;
        }
      };

      scroller.addEventListener('scroll', handleScroll, { passive: true });
      
      // Store cleanup function
      return () => scroller.removeEventListener('scroll', handleScroll);
    };

    const cleanup = findAndAttachScroller();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    const scroller = editorRef.current?.querySelector('.cm-scroller');
    const resultsPanel = resultsRef.current;
    if (!scroller || !resultsPanel) return;

    resultsPanel.scrollTop = scroller.scrollTop;
  }, [activeTabId]);

  useEffect(() => {
    if (!isRenamingTab) return;

    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenamingTab]);

  const updateActiveTabText = (nextText: string) => {
    setTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.id === current.activeTabId ? { ...tab, text: nextText, lastModified: Date.now() } : tab
      )),
    }));
  };

  const beginRenameTab = (tabId: string, title: string) => {
    setPopup({ visible: false, x: 0, y: 0, result: '' });
    setRenameDraft(title);
    setIsRenamingTab(true);
    setTabsState((current) => ({ ...current, activeTabId: tabId }));
  };

  const commitRenameActiveTab = () => {
    const nextTitle = renameDraft.trim() || 'Untitled';
    setTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.id === current.activeTabId ? { ...tab, title: nextTitle, lastModified: Date.now() } : tab
      )),
    }));
    setIsRenamingTab(false);
  };

  const cancelRenameActiveTab = () => {
    setIsRenamingTab(false);
  };

  const selectTab = (tabId: string) => {
    setPopup({ visible: false, x: 0, y: 0, result: '' });
    setIsRenamingTab(false);
    setTabsState((current) => ({ ...current, activeTabId: tabId }));
  };

  const addTab = () => {
    setPopup({ visible: false, x: 0, y: 0, result: '' });
    setIsRenamingTab(false);
    setTabsState((current) => {
      const tab = createTab('', getNextNewNoteTitle(current.tabs));

      return {
        ...current,
        tabs: [...current.tabs, tab],
        activeTabId: tab.id,
      };
    });
  };

  const closeTab = (tabId: string) => {
    setPopup({ visible: false, x: 0, y: 0, result: '' });
    setIsRenamingTab(false);
    setTabsState((current) => {
      if (current.tabs.length <= 1) return current;

      const tabIndex = current.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) return current;

      const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
      const nextActiveTabId = current.activeTabId === tabId
        ? nextTabs[Math.max(0, tabIndex - 1)].id
        : current.activeTabId;

      return { ...current, tabs: nextTabs, activeTabId: nextActiveTabId };
    });
  };

  // Handle selection changes to show popup
  const handleSelectionChange = (view: EditorView) => {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);

    if (selectedText && selection.from !== selection.to) {
      // Skip popup for multiline selections
      if (selectedText.includes('\n')) {
        setPopup({ visible: false, x: 0, y: 0, result: '' });
        return;
      }

      // Skip popup for plain numbers (e.g., "32", "3.14", "-42")
      const isPlainNumber = /^-?\d+(\.\d+)?$/.test(selectedText.trim());
      if (isPlainNumber) {
        setPopup({ visible: false, x: 0, y: 0, result: '' });
        return;
      }

      // Get the line number for relative reference resolution
      const lineNumber = view.state.doc.lineAt(selection.from).number;

      // Evaluate the selected expression
      const result = evaluateExpression(selectedText, lineNumber - 1);
      
      if (result) {
        // Get cursor position for popup placement
        const coords = view.coordsAtPos(selection.to);
        if (coords) {
          setPopup({
            visible: true,
            x: coords.left,
            y: coords.bottom + 8, // 8px below the selection
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

  // Styling and layout calculations
  const lineHeight = fontSize * 2;
  const paddingTop = 24;
  const paddingBottom = `calc(${paddingTop}px + 50vh)`;
  const stripeColor = isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)';
  
  // By shifting the starting Y position strictly upwards by one line height, 
  // we mathematically guarantee the 'transparent' portion of the repeating gradient 
  // completely covers the 24px top padding area. The background naturally spans 
  // edge-to-edge horizontally because we removed the restrictive background-clip.
  const sharedStyle = {
    fontSize: `${fontSize}px`,
    lineHeight: `${lineHeight}px`,
    paddingTop: `${paddingTop}px`,
    paddingBottom: paddingBottom,
    backgroundImage: `repeating-linear-gradient(transparent, transparent ${lineHeight}px, ${stripeColor} ${lineHeight}px, ${stripeColor} ${lineHeight * 2}px)`,
    backgroundAttachment: 'local',
    backgroundPosition: `0 ${paddingTop - lineHeight}px`,
    willChange: 'scroll-position', // Hardware accelerate scrolling
  };

  const editorContainerStyle = {
    '--line-height': `${lineHeight}px`,
    '--padding-top': `${paddingTop}px`,
    '--padding-bottom': paddingBottom,
    '--stripe-color': stripeColor,
  } as CSSProperties;

  const visualResults = useMemo(() => {
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

  // Create EditorView theme to force exact line height matching stripes
  const editorTheme = useMemo(() => EditorView.theme({
    '.cm-content': {
      padding: 'var(--padding-top) var(--padding-top) var(--padding-bottom) var(--padding-top) !important',
    },
    '.cm-line': {
      padding: '0 !important',
      lineHeight: `${lineHeight}px !important`,
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important',
      fontSize: `${fontSize}px !important`,
      lineHeight: `${lineHeight}px !important`,
    },
  }), [lineHeight, fontSize]);

  const handleSelectionChangeRef = useRef(handleSelectionChange);
  handleSelectionChangeRef.current = handleSelectionChange;

  const selectionExtension = useMemo(() => EditorView.updateListener.of((update) => {
    if (update.selectionSet && update.view) {
      handleSelectionChangeRef.current(update.view);
    }
  }), []);

  const cmExtensions = useMemo(() => [
    mathLanguageExtension,
    editorTheme,
    selectionExtension,
    ...(wordWrap ? [EditorView.lineWrapping] : []),
  ], [editorTheme, selectionExtension, wordWrap]);

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
  }, [wordWrap, lineHeight]);

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
  }, [updateVisualLineCounts]);

  useEffect(() => {
    updateVisualLineCounts();
  }, [results, updateVisualLineCounts]);

  return (
    <div className={`flex flex-col h-screen font-sans transition-colors duration-200 ${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <style>{`
        /* Hide scrollbars for a cleaner notepad look, but retain functionality */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <header className={`flex items-center justify-between px-5 sm:px-6 py-2.5 border-b shadow-sm z-10 transition-colors duration-200 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-x-3">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-500 rounded-lg">
            <Calculator size={22} />
          </div>
          <h1 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>NoteCal</h1>
        </div>
        
        <div className="flex items-center gap-x-2.5">
          {/* Desktop inline controls */}
          <div className="hidden md:flex items-center gap-x-2.5">
            <div className={`flex items-center rounded-lg border transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500 hover:border-slate-300'}`}>
              <button type="button"
                onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                data-tooltip-id="header-tooltip"
                data-tooltip-content="Decrease font size"
                className={`p-2.5 rounded-l-lg transition-colors ${isDarkMode ? 'hover:text-emerald-400' : 'hover:text-emerald-600'}`}
              >
                <ZoomOut size={17} />
              </button>
              <div className={`w-px h-4 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-300'}`}></div>
              <button type="button"
                onClick={() => setFontSize(Math.min(32, fontSize + 1))}
                data-tooltip-id="header-tooltip"
                data-tooltip-content="Increase font size"
                className={`p-2.5 rounded-r-lg transition-colors ${isDarkMode ? 'hover:text-emerald-400' : 'hover:text-emerald-600'}`}
              >
                <ZoomIn size={17} />
              </button>
            </div>

            <button type="button"
              onClick={() => setWordWrap(!wordWrap)}
              className={`p-2.5 rounded-lg border transition-colors ${
                wordWrap
                  ? isDarkMode
                    ? 'border-emerald-700 bg-emerald-900/30 text-emerald-400'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-600'
                  : isDarkMode
                    ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-emerald-400 hover:border-slate-700'
                    : 'border-slate-200 bg-slate-100 text-slate-500 hover:text-emerald-600 hover:border-slate-300'
              }`}
              data-tooltip-id="header-tooltip"
              data-tooltip-content="Toggle word wrap"
            >
              <WrapText size={17} />
            </button>

            <button type="button"
              onClick={cycleTheme}
              className={`p-2.5 rounded-lg border transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-emerald-400 hover:border-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500 hover:text-emerald-600 hover:border-slate-300'}`}
              data-tooltip-id="header-tooltip"
              data-tooltip-content={themeMode === 'device' ? 'System theme' : themeMode === 'light' ? 'Light theme' : 'Dark theme'}
            >
              {themeMode === 'device' ? <Monitor size={17} /> : themeMode === 'light' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>

          {/* Overflow menu (mobile: full, desktop: export/import only) */}
          <div className="relative flex" ref={overflowRef}>
            <button type="button"
              onClick={() => setIsOverflowOpen((v) => !v)}
              className={`p-2.5 rounded-lg border transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-emerald-400 hover:border-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500 hover:text-emerald-600 hover:border-slate-300'}`}
            >
              <MoreHorizontal size={17} />
            </button>
            {isOverflowOpen && (
              <div className={`absolute top-full right-0 mt-1.5 py-1.5 rounded-lg border shadow-lg flex flex-col z-50 min-w-[190px] whitespace-nowrap ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                {/* Mobile-only items */}
                <div className="md:hidden flex flex-col">
                  <button type="button"
                    onClick={() => setFontSize(Math.min(32, fontSize + 1))}
                    className={`flex items-center gap-3 px-3.5 py-2 text-sm transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 active:bg-slate-700 hover:text-emerald-400 active:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 hover:text-emerald-700 active:text-emerald-800'}`}
                  >
                    <ZoomIn size={16} /> Increase font size
                  </button>
                  <button type="button"
                    onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                    className={`flex items-center gap-3 px-3.5 py-2 text-sm transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 active:bg-slate-700 hover:text-emerald-400 active:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 hover:text-emerald-700 active:text-emerald-800'}`}
                  >
                    <ZoomOut size={16} /> Decrease font size
                  </button>
                  <button type="button"
                    onClick={() => setWordWrap(!wordWrap)}
                    className={`flex items-center gap-3 px-3.5 py-2 text-sm transition-colors ${
                      wordWrap
                        ? isDarkMode
                          ? 'text-emerald-400 hover:bg-slate-800 active:bg-slate-700'
                          : 'text-emerald-700 hover:bg-slate-100 active:bg-slate-200'
                        : isDarkMode
                          ? 'text-slate-300 hover:bg-slate-800 active:bg-slate-700 hover:text-emerald-400 active:text-emerald-300'
                          : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 hover:text-emerald-700 active:text-emerald-800'
                    }`}
                  >
                    <WrapText size={16} /> {wordWrap ? 'Word wrap on' : 'Word wrap off'}
                  </button>
                  <button type="button"
                    onClick={cycleTheme}
                    className={`flex items-center gap-3 px-3.5 py-2 text-sm transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 active:bg-slate-700 hover:text-emerald-400 active:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 hover:text-emerald-700 active:text-emerald-800'}`}
                  >
                    {themeMode === 'device' ? <Monitor size={16} /> : themeMode === 'light' ? <Sun size={16} /> : <Moon size={16} />} {themeMode === 'device' ? 'System theme' : themeMode === 'light' ? 'Light theme' : 'Dark theme'}
                  </button>
                  <div className={`mx-3.5 my-1.5 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`} />
                </div>
                {/* All-screen items */}
                <button type="button"
                  onClick={exportTabs}
                  className={`flex items-center gap-3 px-3.5 py-2 text-sm transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 active:bg-slate-700 hover:text-emerald-400 active:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 hover:text-emerald-700 active:text-emerald-800'}`}
                >
                  <Download size={16} /> Export data
                </button>
                <button type="button"
                  onClick={importTabs}
                  className={`flex items-center gap-3 px-3.5 py-2 text-sm transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 active:bg-slate-700 hover:text-emerald-400 active:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 hover:text-emerald-700 active:text-emerald-800'}`}
                >
                  <Upload size={16} /> Import data
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Tabs */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`flex items-stretch border-b overflow-x-auto no-scrollbar overscroll-x-none transition-colors duration-200 ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
          <SortableContext
            items={tabs.map((t) => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            {tabs.map((tab, index) => {
              const isActive = tab.id === activeTabId;

              return (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isActive={isActive}
                  isDarkMode={isDarkMode}
                  isRenaming={isActive && isRenamingTab}
                  renameDraft={renameDraft}
                  tabsLength={tabs.length}
                  onSelect={() => selectTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  onBeginRename={() => beginRenameTab(tab.id, tab.title)}
                  onRenameChange={setRenameDraft}
                  onRenameCommit={commitRenameActiveTab}
                  onRenameCancel={cancelRenameActiveTab}
                  renameInputRef={renameInputRef}
                  onKeyDown={(e) => {
                    if (e.key === 'F2') {
                      e.preventDefault();
                      beginRenameTab(tab.id, tab.title);
                    }
                    if (e.key === 'Escape') {
                      cancelRenameActiveTab();
                    }
                  }}
                />
              );
            })}
          </SortableContext>

          <button type="button"
            onClick={addTab}
            className={`shrink-0 flex items-center gap-1.5 h-9 px-3 text-sm transition-colors ${isDarkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-emerald-300' : 'border-slate-200 text-slate-500 hover:bg-white hover:text-emerald-700'}`}
          >
            <Plus size={15} />
          </button>

        </div>

        <DragOverlay dropAnimation={null}>
          {activeId ? (
            (() => {
              const activeTab = tabs.find((t) => t.id === activeId);
              const index = tabs.findIndex((t) => t.id === activeId);
              if (!activeTab) return null;

              const title = activeTab.title.trim() || (index === 0 ? 'New Note' : `New Note (${index + 1})`);

              return (
                <div
                  className={`flex shrink-0 basis-22 sm:basis-26 items-center h-9 border-r text-sm ${
                    isDarkMode
                      ? 'bg-slate-800 border-slate-600 text-slate-100 shadow-2xl'
                      : 'bg-white border-slate-400 text-slate-900 shadow-2xl'
                  }`}
                  style={{ transform: 'scale(1.05)', opacity: 0.95 }}
                >
                  <span className="min-w-0 flex-1 px-3 truncate">{title}</span>
                  {tabs.length > 1 && (
                    <div className={`mr-2 shrink-0 p-0.5 opacity-60 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <X size={14} />
                    </div>
                  )}
                </div>
              );
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Main Workspace */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Editor Area */}
        <div
          ref={editorRef}
          className="flex-1 w-full h-full overflow-hidden"
          style={editorContainerStyle}
        >
          <style>{`
            .editor-with-stripes .cm-scroller {
              background-image: repeating-linear-gradient(
                transparent,
                transparent ${lineHeight}px,
                ${stripeColor} ${lineHeight}px,
                ${stripeColor} ${lineHeight * 2}px
              );
              background-position: 0 ${paddingTop - lineHeight}px;
            }
          `}</style>
          <CodeMirror
            value={text}
            onChange={updateActiveTabText}
            theme={isDarkMode ? mathDarkTheme : mathLightTheme}
            extensions={cmExtensions}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLineGutter: false,
              highlightActiveLine: false,
              dropCursor: false,
              allowMultipleSelections: false,
              indentOnInput: false,
              bracketMatching: false,
              closeBrackets: false,
              autocompletion: false,
              rectangularSelection: false,
              crosshairCursor: false,
              highlightSelectionMatches: false,
              closeBracketsKeymap: false,
              searchKeymap: false,
              foldKeymap: false,
              completionKeymap: false,
              lintKeymap: false,
            }}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}px`,
              height: '100%',
            }}
            className={`h-full editor-with-stripes ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}
          />
        </div>

        {/* Results Panel Container */}
        <div className={`w-32 md:w-56 h-full border-l shadow-inner transition-colors duration-200 ${isDarkMode ? 'bg-slate-800/40 border-slate-800/80' : 'bg-slate-100/50 border-slate-200'}`}>
          {/* Results Panel Content */}
          <div
            ref={resultsRef}
            style={sharedStyle}
            className={`w-full h-full px-4 md:px-6 overflow-hidden no-scrollbar font-mono text-right transition-colors duration-200 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
          >
             {visualResults.map((res, i) => (
               <div key={i} style={{ height: lineHeight }} className="truncate pr-2 tracking-wide font-medium">
                 {res.text}
               </div>
             ))}
          </div>
        </div>
      </main>

      {/* Instant Result Popup */}
      {popup.visible && (
        <div
          className={`fixed z-50 px-3 py-2 rounded-lg shadow-2xl border font-mono text-sm font-semibold pointer-events-none transition-opacity duration-150 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-emerald-400' : 'bg-white border-slate-300 text-emerald-600'}`}
          style={{
            left: `${popup.x}px`,
            top: `${popup.y}px`,
          }}
        >
          = {popup.result}
        </div>
      )}

      <Tooltip
        id="header-tooltip"
        place="bottom"
        offset={8}
        className={`!text-[13px] !px-1 !py-0.5 !z-[60] ${isDarkMode ? '!bg-slate-800 !text-slate-100' : '!bg-white !text-slate-900 !border !border-slate-300'}`}
        noArrow
      />
    </div>
  );
}
