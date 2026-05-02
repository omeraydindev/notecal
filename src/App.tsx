import { useState, useEffect, useRef } from 'react';
import { Calculator, Trash2, Sun, Moon, ZoomIn, ZoomOut } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { mathLanguageExtension } from './mathLanguage';
import { mathDarkTheme, mathLightTheme } from './mathTheme';

// Extend Window interface to include math.js
declare global {
  interface Window {
    math: any;
  }
}

interface Result {
  text: string;
  value: number | null;
}

const INITIAL_TEXT = `// Welcome to NoteCal!
// Type anywhere, math gets calculated automatically on the right.

Income = 5k
Rent = 1.2k
Groceries = 150 * 4
Utilities = 200
Subscriptions = 15 + 10 + 12.50

Total = Rent + Groceries + Utilities + Subscriptions

// You can use variables and shorthands (k, m, b):
Savings = 0.20 * Income
Bonus = 1.5m

// And complex math functions:
sqrt(144) + 2^3
sin(45 deg)
`;

export default function App() {
  const [text, setText] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('notecal-text');
      if (saved !== null) return saved;
    }
    return INITIAL_TEXT;
  });
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [isMathLoaded, setIsMathLoaded] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('notecal-fontSize');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 12 && parsed <= 32) {
          return parsed;
        }
      }
    }
    return 17;
  });
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  
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
  const scopeRef = useRef<any>({});

  // Persist text to local storage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notecal-text', text);
    }
  }, [text]);

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

  const formatNumber = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(num);
  };

  // Evaluate a single expression (for popup)
  const evaluateExpression = (expr: string): string | null => {
    if (!isMathLoaded || !window.math || !expr.trim()) return null;

    // Process shorthand multipliers (k, m, b)
    let processedExpr = expr.replace(/(\d+(?:\.\d+)?)([kmb])\b/gi, (_match, num, suffix) => {
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
      if (res.isUnit || res.isComplex || res.isFraction) {
        return res.toString();
      }

      return null;
    } catch (err) {
      return null;
    }
  };

  // Evaluate text line by line whenever it changes
  useEffect(() => {
    if (!isMathLoaded || !window.math) return;

    const lines = text.split('\n');
    const scope = {}; // Reset variables scope on every render
    let currentTotal = 0;

    const newResults = lines.map((line) => {
      // 1. Ignore comments
      if (line.trim().startsWith('//')) return { text: '', value: null };

      let expr = line;

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
          currentTotal += res;
          return { text: formatNumber(res), value: res };
        }

        // Math.js specific objects (Units, Complex numbers, etc.)
        if (res.isUnit || res.isComplex || res.isFraction) {
          return { text: res.toString(), value: null };
        }

        return { text: '', value: null };
      } catch (err) {
        // Silently ignore errors (e.g., normal text that isn't valid math)
        return { text: '', value: null };
      }
    });

    setResults(newResults);
    setTotal(currentTotal);
    scopeRef.current = scope; // Store scope for popup evaluation
  }, [text, isMathLoaded]);

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

  const handleClear = () => {
    setIsClearModalOpen(true);
  };

  const confirmClear = () => {
    setText('');
    setIsClearModalOpen(false);
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
  const paddingTop = 24; // 24px padding top and bottom
  const stripeColor = isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)';
  
  // By shifting the starting Y position strictly upwards by one line height, 
  // we mathematically guarantee the 'transparent' portion of the repeating gradient 
  // completely covers the 24px top padding area. The background naturally spans 
  // edge-to-edge horizontally because we removed the restrictive background-clip.
  const sharedStyle = {
    fontSize: `${fontSize}px`,
    lineHeight: `${lineHeight}px`,
    paddingTop: `${paddingTop}px`,
    paddingBottom: `${paddingTop}px`,
    backgroundImage: `repeating-linear-gradient(transparent, transparent ${lineHeight}px, ${stripeColor} ${lineHeight}px, ${stripeColor} ${lineHeight * 2}px)`,
    backgroundAttachment: 'local',
    backgroundPosition: `0 ${paddingTop - lineHeight}px`,
    willChange: 'scroll-position', // Hardware accelerate scrolling
  };

  // Create EditorView theme to force exact line height matching stripes
  const editorTheme = EditorView.theme({
    '.cm-content': {
      padding: '24px !important',
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
      <header className={`flex items-center justify-between px-6 py-4 border-b shadow-sm z-10 transition-colors duration-200 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/20 text-emerald-500 rounded-lg">
            <Calculator size={24} />
          </div>
          <h1 className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>NoteCal</h1>
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-3">
          {!isMathLoaded && (
            <span className="text-sm text-slate-400 animate-pulse hidden sm:inline mr-2">Loading Math Engine...</span>
          )}

          {/* Font Size Controls */}
          <div className={`flex items-center space-x-1 border rounded-lg p-1 transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-100'}`}>
            <button onClick={() => setFontSize(Math.max(12, fontSize - 1))} className={`p-1.5 rounded hover:bg-emerald-500/20 transition-colors ${isDarkMode ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-500 hover:text-emerald-600'}`} title="Decrease Font Size"><ZoomOut size={18} /></button>
            <div className={`w-px h-4 mx-1 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-300'}`}></div>
            <button onClick={() => setFontSize(Math.min(32, fontSize + 1))} className={`p-1.5 rounded hover:bg-emerald-500/20 transition-colors ${isDarkMode ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-500 hover:text-emerald-600'}`} title="Increase Font Size"><ZoomIn size={18} /></button>
          </div>

          <div className={`h-6 w-px mx-1 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-300'}`}></div>

          {/* Theme Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2.5 rounded-lg border transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-amber-400 hover:border-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500 hover:text-amber-500 hover:border-slate-300'}`}
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Clear Button */}
          <button
            onClick={handleClear}
            className={`p-2.5 rounded-lg border transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-red-400 hover:border-red-900/50 hover:bg-red-900/20' : 'border-slate-200 bg-slate-100 text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50'}`}
            title="Clear All"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Editor Area */}
        <div
          ref={editorRef}
          className="flex-1 w-full h-full overflow-hidden"
          style={{
            ['--line-height' as any]: `${lineHeight}px`,
            ['--padding-top' as any]: `${paddingTop}px`,
            ['--stripe-color' as any]: stripeColor,
          }}
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
            onChange={(value) => setText(value)}
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

      {/* Footer / Total Sum */}
      <footer className={`flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-t z-10 transition-colors duration-200 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
        <a 
          href="https://omeraydin.dev" 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`text-xs transition-colors ${isDarkMode ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-600'}`}
        >
          omeraydin.dev
        </a>
        <div className="flex items-center space-x-2 sm:space-x-4">
          <span className={`uppercase tracking-wider text-xs sm:text-sm font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Sum</span>
          <span className={`font-mono text-sm sm:text-xl font-bold px-2 sm:px-3 py-1 rounded-lg border shadow-inner transition-colors duration-200 ${isDarkMode ? 'text-emerald-400 bg-slate-900 border-slate-800' : 'text-emerald-600 bg-slate-50 border-slate-200'}`}>
            {formatNumber(total)}
          </span>
        </div>
      </footer>

      {/* Custom Clear Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`max-w-sm w-full p-6 rounded-xl shadow-2xl transform transition-all ${isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <h3 className={`text-lg font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Clear NoteCal?
            </h3>
            <p className={`mb-6 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Are you sure you want to clear all your text and calculations? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsClearModalOpen(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

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
