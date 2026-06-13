import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import { Tooltip } from 'react-tooltip';
import { Calculator, Sun, Moon, Monitor, ZoomIn, ZoomOut, Plus, X, WrapText, MoreHorizontal, Download, Upload } from 'lucide-react';
import type { MathScope, Result } from './types';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { mathLanguageExtension } from './mathLanguage';
import { mathDarkTheme, mathLightTheme } from './mathTheme';
import { createTab, getNextNewNoteTitle } from './tabUtils';
import { tabsAtom, fontSizeAtom, wordWrapAtom, mathAtom } from './store';
import { processLines } from './evalUtils';
import { initMath } from './constants';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useClickOutside } from './hooks/useClickOutside';
import { useCurrencyRates } from './hooks/useCurrencyRates';
import { useAutocomplete } from './hooks/useAutocomplete';
import { useSelectionPopup } from './hooks/useSelectionPopup';
import { useVisualLineCounts } from './hooks/useVisualLineCounts';
import { useTabBackup } from './hooks/useTabBackup';
import { useScrollSync } from './hooks/useScrollSync';
import { useTabDnd } from './hooks/useTabDnd';
import { useCrossTabRef } from './hooks/useCrossTabRef';
import SortableTab from './components/SortableTab';
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';

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
  const [math, setMath] = useAtom(mathAtom);
  
  // Theme mode: 'device' follows system, 'light'/'dark' are explicit
  const [themeMode, setThemeMode] = useState<'device' | 'light' | 'dark'>('device');
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');

  const isDarkMode = themeMode === 'device' ? systemDark : themeMode === 'dark';

  const cycleTheme = useCallback(() => {
    setThemeMode(prev => {
      if (prev === 'device') return 'light';
      if (prev === 'light') return 'dark';
      return 'device';
    });
  }, []);

  const editorRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef<MathScope>({});
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useClickOutside(overflowRef, () => setIsOverflowOpen(false), isOverflowOpen);

  const currencyLoaded = useCurrencyRates();

  const { popup, clearPopup, selectionExtension } = useSelectionPopup(scopeRef);

  const { exportTabs, importTabs } = useTabBackup(tabsState, setTabsState, setIsOverflowOpen);

  useScrollSync(editorRef, resultsRef, activeTabId);

  const { sensors, handleDragStart, handleDragEnd, activeId } = useTabDnd(tabs, setTabsState);

  const { resolveRef, tabsContentKey, tabScopesRef, tabLastModifiedRef } = useCrossTabRef(tabs);
  const currencyLoadedRef = useRef(false);

  const completionSource = useAutocomplete(scopeRef);

  useEffect(() => {
    initMath().then(setMath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Evaluate text line by line whenever it changes
  useEffect(() => {
    if (!math) return;

    // Clear cached cross-tab scopes when currency first loads — they may have
    // been evaluated without currency units and cached stale (empty) scopes.
    if (currencyLoaded && !currencyLoadedRef.current) {
      Object.keys(tabScopesRef.current).forEach(k => delete tabScopesRef.current[k]);
    }
    currencyLoadedRef.current = currencyLoaded;

    // Invalidate cached scopes for tabs whose content changed since last evaluation
    for (const tab of tabs) {
      const prev = tabLastModifiedRef.current[tab.id];
      if (prev !== undefined && prev !== tab.lastModified) {
        delete tabScopesRef.current[tab.title];
      }
      tabLastModifiedRef.current[tab.id] = tab.lastModified;
    }

    const scope: MathScope = { ref: resolveRef };
    const newResults = processLines(text.split('\n'), scope, math);

    setResults(newResults);
    scopeRef.current = { ...scope, ref: resolveRef }; // Store scope for popup evaluation (keep ref)
    tabScopesRef.current[activeTab.title] = { ...scope };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, currencyLoaded, activeTab.title, tabsContentKey, math]);

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
    clearPopup();
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
    clearPopup();
    setIsRenamingTab(false);
    setTabsState((current) => ({ ...current, activeTabId: tabId }));
  };

  const addTab = () => {
    clearPopup();
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
    clearPopup();
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

  // Styling and layout calculations
  const lineHeight = fontSize * 2;

  const visualResults = useVisualLineCounts(wordWrap, lineHeight, editorRef, results);

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
    '.cm-completionIcon-unit': {
      display: 'none !important',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      background: 'rgba(17,119,204,0.15) !important',
      color: 'inherit !important',
    },
  }), [lineHeight, fontSize]);

  const cmExtensions = useMemo(() => [
    mathLanguageExtension,
    editorTheme,
    selectionExtension,
    autocompletion({
      override: [completionSource],
      addToOptions: [{
        position: 10,
        render(completion) {
          if ((completion as unknown as Record<string, unknown>).icon === 'currency') {
            const span = document.createElement('span');
            span.style.cssText = 'color:#10b981;font-weight:700;padding-right:10px';
            span.textContent = '$';
            return span;
          }
          if ((completion as unknown as Record<string, unknown>).icon === 'unit') {
            const span = document.createElement('span');
            span.style.cssText = 'color:#3b82f6;font-weight:700;padding-right:10px';
            span.textContent = '#';
            return span;
          }
          return null;
        },
      }],
    }),
    ...(wordWrap ? [EditorView.lineWrapping] : []),
  ], [editorTheme, selectionExtension, wordWrap, completionSource]);

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
