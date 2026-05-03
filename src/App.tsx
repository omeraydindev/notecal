import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { Calculator, Sun, Moon, ZoomIn, ZoomOut, Plus, X } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { mathLanguageExtension } from './mathLanguage';
import { mathDarkTheme, mathLightTheme } from './mathTheme';

// Extend Window interface to include math.js
declare global {
  interface Window {
    math: MathApi;
  }
}

type MathScope = Record<string, unknown>;

type MathDisplayObject = {
  isUnit?: boolean;
  isComplex?: boolean;
  isFraction?: boolean;
  toString: () => string;
};

type MathEvaluationResult = number | MathDisplayObject | ((...args: never[]) => unknown) | null | undefined;

interface MathApi {
  evaluate: (expr: string, scope?: MathScope) => MathEvaluationResult;
}

interface Result {
  text: string;
  value: number | null;
}

interface NoteTab {
  id: string;
  title: string;
  text: string;
}

interface StoredTabsState {
  tabs: NoteTab[];
  activeTabId: string;
}

const TABS_STORAGE_KEY = 'notecal-tabs';
const LEGACY_TEXT_STORAGE_KEY = 'notecal-text';

const INITIAL_TEXT = `// Welcome to NoteCal!
// Type anywhere, math gets calculated automatically on the right.

income = 5k
rent = 1.2k
groceries = 150 * 4
utilities = 200
subscriptions = 15 + 10 + 12.50

total = rent + groceries + utilities + subscriptions

// You can use variables and shorthands (k, m, b):
savings = 0.20 * income
bonus = 1.5m

// And complex math functions:
sqrt(144) + 2^3
sin(45 deg)
`;

const createTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDefaultTabTitle = (index: number) => {
  return index === 0 ? 'New Note' : `New Note (${index + 1})`;
};

const createTab = (text = '', title = 'New Note'): NoteTab => ({
  id: createTabId(),
  title,
  text,
});

const normalizeTab = (tab: unknown, index: number): NoteTab | null => {
  if (!tab || typeof tab !== 'object') return null;
  const candidate = tab as Partial<NoteTab>;
  if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string') return null;

  return {
    id: candidate.id,
    title: typeof candidate.title === 'string' && candidate.title.trim()
      ? candidate.title.trim()
      : getDefaultTabTitle(index),
    text: candidate.text,
  };
};

const normalizeTabsState = (state: unknown): StoredTabsState | null => {
  if (!state || typeof state !== 'object') return null;

  const candidate = state as Partial<StoredTabsState>;
  if (!Array.isArray(candidate.tabs)) return null;

  const tabs = candidate.tabs
    .map((tab, index) => normalizeTab(tab, index))
    .filter((tab): tab is NoteTab => tab !== null);
  if (tabs.length === 0) return null;

  const activeTabId = tabs.some((tab) => tab.id === candidate.activeTabId)
    ? (candidate.activeTabId as string)
    : tabs[0].id;

  return { tabs, activeTabId };
};

const loadInitialTabsState = (): StoredTabsState => {
  if (typeof window !== 'undefined') {
    const savedTabs = localStorage.getItem(TABS_STORAGE_KEY);
    if (savedTabs !== null) {
      try {
        const normalized = normalizeTabsState(JSON.parse(savedTabs));
        if (normalized) return normalized;
      } catch (error) {
        console.warn('Failed to load saved tabs:', error);
      }
    }

    const legacyText = localStorage.getItem(LEGACY_TEXT_STORAGE_KEY);
    const text = legacyText ?? INITIAL_TEXT;
    const tab = createTab(text, 'New Note');
    return { tabs: [tab], activeTabId: tab.id };
  }

  const tab = createTab(INITIAL_TEXT, 'New Note');
  return { tabs: [tab], activeTabId: tab.id };
};

const getTabTitle = (tab: NoteTab, index: number) => {
  return tab.title.trim() || getDefaultTabTitle(index);
};

const getNextNewNoteTitle = (tabs: NoteTab[]) => {
  const existingTitles = new Set(tabs.map((tab) => tab.title.trim()));
  if (!existingTitles.has('New Note')) return 'New Note';

  let index = 2;
  while (existingTitles.has(`New Note (${index})`)) {
    index += 1;
  }

  return `New Note (${index})`;
};

const isMathDisplayObject = (value: MathEvaluationResult): value is MathDisplayObject => (
  typeof value === 'object'
  && value !== null
  && ('isUnit' in value || 'isComplex' in value || 'isFraction' in value)
);

export default function App() {
  const [tabsState, setTabsState] = useState(loadInitialTabsState);
  const { tabs, activeTabId } = tabsState;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const text = activeTab?.text ?? '';
  const [results, setResults] = useState<Result[]>([]);
  const [isMathLoaded, setIsMathLoaded] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('notecal-fontSize');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 10 && parsed <= 32) {
          return parsed;
        }
      }
    }
    return 17;
  });
  const [isRenamingTab, setIsRenamingTab] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  
  // Default to system theme preferences
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  // Popup state for instant expression results
  const [popup, setPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    result: string;
  }>({ visible: false, x: 0, y: 0, result: '' });

  const editorRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef<MathScope>({});
  const currencyRates = useRef<Record<string, number>>({});
  const availableCurrencies = useRef<string[]>([]);
  const currencyFetchTriggered = useRef(false);
  const [currencyLoaded, setCurrencyLoaded] = useState(false);

  // Persist tabs to local storage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabsState));
      } catch (error) {
        console.warn('Failed to persist tabs:', error);
      }
    }
  }, [tabsState]);

  // Persist font size to local storage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notecal-fontSize', fontSize.toString());
    }
  }, [fontSize]);

  // Dynamically load Math.js from CDN for robust and safe evaluation
  useEffect(() => {
    if (window.math) {
      setIsMathLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.8.0/math.min.js';
    script.async = true;
    script.onload = () => setIsMathLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Fetch currency rates only when a conversion function is used in text
  useEffect(() => {
    if (!isMathLoaded || !window.math || currencyFetchTriggered.current) return;

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
  }, [isMathLoaded, text]);

  const formatNumber = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(num);
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
  const evaluateExpression = (expr: string): string | null => {
    const { expr: uncommentedExpr } = stripComments(expr);
    if (!isMathLoaded || !window.math || !uncommentedExpr) return null;

    // Process shorthand multipliers (k, m, b)
    const processedExpr = uncommentedExpr.replace(/(\d+(?:\.\d+)?)([kmb])\b/gi, (_match, num, suffix) => {
      const multipliers: { [key: string]: number } = { k: 1e3, m: 1e6, b: 1e9 };
      return `(${num} * ${multipliers[suffix.toLowerCase()]})`;
    });

    try {
      // Use the current scope from main evaluation
      const res = window.math.evaluate(processedExpr, scopeRef.current);

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

  // Evaluate text line by line whenever it changes
  useEffect(() => {
    if (!isMathLoaded || !window.math) return;

    const lines = text.split('\n');
    const currencyFunctions = Object.fromEntries(
      Object.entries(scopeRef.current).filter(([, v]) => typeof v === 'function')
    );
    const scope = { ...currencyFunctions }; // Reset variables scope on every render, but keep currency functions
    let isInBlockComment = false;

    const newResults = lines.map((line) => {
      const strippedLine = stripComments(line, isInBlockComment);
      isInBlockComment = strippedLine.isInBlockComment;

      let expr = strippedLine.expr;
      if (!expr) return { text: '', value: null };

      // 2. Process shorthand multipliers (k, m, b)
      expr = expr.replace(/(\d+(?:\.\d+)?)([kmb])\b/gi, (_match, num, suffix) => {
        const multipliers: { [key: string]: number } = { k: 1e3, m: 1e6, b: 1e9 };
        return `(${num} * ${multipliers[suffix.toLowerCase()]})`;
      });

      try {
        // Evaluate using math.js
        const res = window.math.evaluate(expr, scope);

        if (res === undefined || res === null || typeof res === 'function') {
          return { text: '', value: null };
        }

        // Standard Numbers
        if (typeof res === 'number') {
          return { text: formatNumber(res), value: res };
        }

        // Math.js specific objects (Units, Complex numbers, etc.)
        if (isMathDisplayObject(res)) {
          return { text: res.toString(), value: null };
        }

        return { text: '', value: null };
      } catch {
        // Silently ignore errors (e.g., normal text that isn't valid math)
        return { text: '', value: null };
      }
    });

    setResults(newResults);
    scopeRef.current = scope; // Store scope for popup evaluation
  }, [text, isMathLoaded, currencyLoaded]);

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
        tab.id === current.activeTabId ? { ...tab, text: nextText } : tab
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
        tab.id === current.activeTabId ? { ...tab, title: nextTitle } : tab
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

      return { tabs: nextTabs, activeTabId: nextActiveTabId };
    });
  };

  // Handle selection changes to show popup
  const handleSelectionChange = (view: EditorView) => {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);

    if (selectedText && selection.from !== selection.to) {
      // Skip popup for plain numbers (e.g., "32", "3.14", "-42")
      const isPlainNumber = /^-?\d+(\.\d+)?$/.test(selectedText.trim());
      if (isPlainNumber) {
        setPopup({ visible: false, x: 0, y: 0, result: '' });
        return;
      }

      // Evaluate the selected expression
      const result = evaluateExpression(selectedText);
      
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

  // Create EditorView theme to force exact line height matching stripes
  const editorTheme = EditorView.theme({
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
  });

  // Create extension for selection change handling
  // eslint-disable-next-line react-hooks/refs -- CodeMirror invokes this callback after render as an editor update listener.
  const selectionExtension = EditorView.updateListener.of((update) => {
    if (update.selectionSet && update.view) {
      handleSelectionChange(update.view);
    }
  });

  return (
    <div className={`flex flex-col h-screen font-sans transition-colors duration-200 ${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <style>{`
        /* Hide scrollbars for a cleaner notepad look, but retain functionality */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <header className={`flex items-center justify-between px-5 sm:px-6 py-2.5 border-b shadow-sm z-10 transition-colors duration-200 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center space-x-3">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-500 rounded-lg">
            <Calculator size={22} />
          </div>
          <h1 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>NoteCal</h1>
        </div>
        
        <div className="flex items-center space-x-2.5">
          {!isMathLoaded && (
            <span className="text-sm text-slate-400 animate-pulse hidden sm:inline mr-2">Loading Math Engine...</span>
          )}

          {/* Font Size Controls */}
          <div className={`flex items-center rounded-lg border transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500 hover:border-slate-300'}`}>
            <button
              onClick={() => setFontSize(Math.max(10, fontSize - 1))}
              className={`p-2.5 rounded-l-lg transition-colors ${isDarkMode ? 'hover:text-emerald-400' : 'hover:text-emerald-600'}`}
              title="Decrease Font Size"
            >
              <ZoomOut size={17} />
            </button>
            <div className={`w-px h-4 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-300'}`}></div>
            <button
              onClick={() => setFontSize(Math.min(32, fontSize + 1))}
              className={`p-2.5 rounded-r-lg transition-colors ${isDarkMode ? 'hover:text-emerald-400' : 'hover:text-emerald-600'}`}
              title="Increase Font Size"
            >
              <ZoomIn size={17} />
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2.5 rounded-lg border transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-emerald-400 hover:border-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500 hover:text-emerald-600 hover:border-slate-300'}`}
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>

        </div>
      </header>

      {/* Tabs */}
      <div className={`flex items-stretch border-b overflow-x-auto no-scrollbar transition-colors duration-200 ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const title = getTabTitle(tab, index);

          return (
            <div
              key={tab.id}
              className={`group flex shrink-0 basis-22 sm:basis-26 items-center h-9 border-r text-sm transition-colors ${isActive ? (isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-[inset_0_2px_0_#10b981]' : 'bg-white border-slate-300 text-slate-900 shadow-[inset_0_2px_0_#059669]') : (isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-white hover:text-slate-800')}`}
            >
              {isActive && isRenamingTab ? (
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={commitRenameActiveTab}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRenameActiveTab();
                    if (event.key === 'Escape') cancelRenameActiveTab();
                  }}
                  className={`min-w-0 flex-1 h-full px-3 bg-transparent outline-none ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
                  aria-label="Rename current tab"
                />
              ) : (
                <button
                  onClick={(event) => {
                    if (event.shiftKey && tabs.length > 1) {
                      closeTab(tab.id);
                      return;
                    }

                    selectTab(tab.id);
                  }}
                  onDoubleClick={() => {
                    beginRenameTab(tab.id, title);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'F2') {
                      event.preventDefault();
                      beginRenameTab(tab.id, title);
                    }
                  }}
                  className={`min-w-0 flex-1 h-full px-3 ${tabs.length === 1 ? 'text-center' : 'text-left'}`}
                  title={`${title} (double-click or F2 to rename${tabs.length > 1 ? ', shift-click to close' : ''})`}
                >
                  <span className="block truncate">{title}</span>
                </button>
              )}
              {tabs.length > 1 && (
                <button
                  aria-label={`Close ${title}`}
                  onClick={() => closeTab(tab.id)}
                  className={`mr-2 shrink-0 p-0.5 opacity-60 transition-colors group-hover:opacity-100 ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'}`}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={addTab}
          className={`shrink-0 flex items-center gap-1.5 h-9 px-3 text-sm transition-colors ${isDarkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-emerald-300' : 'border-slate-200 text-slate-500 hover:bg-white hover:text-emerald-700'}`}
          title="New note"
        >
          <Plus size={15} />
        </button>

      </div>

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
            extensions={[
              mathLanguageExtension,
              editorTheme,
              selectionExtension,
            ]}
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
        <div className={`w-40 md:w-56 h-full border-l shadow-inner transition-colors duration-200 ${isDarkMode ? 'bg-slate-800/40 border-slate-800/80' : 'bg-slate-100/50 border-slate-200'}`}>
          {/* Results Panel Content */}
          <div
            ref={resultsRef}
            style={sharedStyle}
            className={`w-full h-full px-4 md:px-6 overflow-hidden no-scrollbar font-mono text-right select-none pointer-events-none transition-colors duration-200 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
          >
            {results.map((res, i) => (
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
    </div>
  );
}
