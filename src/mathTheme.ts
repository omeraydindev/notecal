import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';

// Dark theme matching the NoteCal design
export const mathDarkTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: '#e2e8f0', // slate-200
    caret: '#10b981', // emerald-500
    selection: '#334155', // slate-700
    selectionMatch: '#334155',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterForeground: '#64748b', // slate-500
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  styles: [
    { tag: t.comment, color: '#64748b' }, // slate-500
    { tag: t.number, color: '#fbbf24' }, // amber-400
    { tag: t.function(t.variableName), color: '#a78bfa' }, // violet-400
    { tag: t.variableName, color: '#60a5fa' }, // blue-400
    { tag: t.operator, color: '#94a3b8' }, // slate-400
    { tag: t.keyword, color: '#f472b6' }, // pink-400
    { tag: t.atom, color: '#34d399' }, // emerald-400
  ],
});

// Light theme matching the NoteCal design
export const mathLightTheme = createTheme({
  theme: 'light',
  settings: {
    background: 'transparent',
    foreground: '#1e293b', // slate-800
    caret: '#059669', // emerald-600
    selection: '#e2e8f0', // slate-200
    selectionMatch: '#e2e8f0',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterForeground: '#94a3b8', // slate-400
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  styles: [
    { tag: t.comment, color: '#94a3b8' }, // slate-400
    { tag: t.number, color: '#f59e0b' }, // amber-500
    { tag: t.function(t.variableName), color: '#8b5cf6' }, // violet-500
    { tag: t.variableName, color: '#3b82f6' }, // blue-500
    { tag: t.operator, color: '#64748b' }, // slate-500
    { tag: t.keyword, color: '#ec4899' }, // pink-500
    { tag: t.atom, color: '#10b981' }, // emerald-500
  ],
});
