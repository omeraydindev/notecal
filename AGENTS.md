# AGENTS.md

## Product Context
- NoteCal is a notepad-style calculator: users type freeform notes and math expressions, then see line-by-line results instantly.
- The app is useful because calculations stay readable and editable alongside surrounding notes instead of being isolated calculator inputs.
- Users can keep multiple persisted note tabs, each with its own title and text.

## Commands
- Use npm; `package-lock.json` is the source of truth and CI installs with `npm ci`.
- Never run `npm run dev` or otherwise start the dev server; the user handles local serving.
- `npm run build` runs `tsc -b` before `vite build`; use this as the main verification step because there is no test script.
- `npm run lint` runs ESLint over the repo; run it for TS/React changes.
- There is no configured unit test runner or single-test command.

## Git Workflow
- Never run destructive or state-changing git commands, including `git add`, `git commit`, `git push`, `git pull`, resets, checkouts, rebases, or merges; the user handles git operations.
- After completing a feature or bugfix, suggest one conventional commit message at the end of the final response.
- Suggested commit messages must be lowercase, have no parentheses, and the subject after the type must start with a verb, for example `fix: align result panel scrolling`.

## App Structure
- This is a single-package React 19 + TypeScript + Vite app; the runtime entrypoint is `src/main.tsx`, and nearly all UI/evaluation behavior lives in `src/App.tsx`.
- `src/mathLanguage.ts` defines the custom CodeMirror stream language for NoteCal syntax, while `src/mathTheme.ts` defines light/dark CodeMirror themes.
- `src/constants.ts` exports `initMath()` for lazy-loading Math.js and shared constants; the math instance is stored in the Jotai `mathAtom`.
- `src/tabUtils.ts` holds tab creation, normalization, and title utility functions.
- `src/evalUtils.ts` holds pure expression helpers: `isMathDisplayObject`, `formatNumber`, `resolveLineReferences`, `stripComments`, `evaluateSingle`, `processLines`, and the `currencyCodes` set for identifying currency unit results.
- `src/hooks/useAutocomplete.ts` provides word-based autocomplete via `@codemirror/autocomplete` — suggests user variables, mathjs functions/constants, common physical units, and currency codes with custom `$`/`#` icons.
- `src/hooks/useCurrencyRates.ts` fetches exchange rates and registers currencies as mathjs units (e.g. `100 usd to eur`) — always fetches on first load when Math.js is ready.
- `src/hooks/useTabBackup.ts` handles JSON export/import of all tabs.
- `src/hooks/useScrollSync.ts` synchronizes results panel scrolling with CodeMirror via native DOM scroll events.
- `src/hooks/useCrossTabRef.ts` provides the `ref()` function for cross-tab variable access with lazy evaluation.
- `src/store.ts` defines Jotai atoms for persisted state (tabs, font size, word wrap) and the math instance (`mathAtom`) — no manual `useEffect` persistence.
- `src/components/SortableTab.tsx` is the draggable tab component.
- Tailwind CSS v4 is wired through `@tailwindcss/vite` in `vite.config.ts` and imported from `src/index.css`; there is no separate Tailwind config file.
- Tooltips use `react-tooltip` via a shared `<Tooltip id="header-tooltip">` in `App.tsx`; anchor elements use `data-tooltip-id` + `data-tooltip-content`.
- Math evaluation uses Math.js.

## Runtime Gotchas
- Currency conversion uses mathjs units (e.g. `100 usd to eur`). Rates are fetched from `https://open.er-api.com/v6/latest/USD` on first load when math.js is ready. Once loaded, any mathjs unit conversion works (e.g. `1 inch to cm`, `90 km/h to m/s`).
- Tabs, font size, and word wrap persist in `localStorage` via Jotai `atomWithStorage` (keys: `notecal-tabs`, `notecal-fontSize`, `notecal-wordWrap`); theme follows `prefers-color-scheme` and is not persisted.
- When word wrap is enabled, the results panel aligns with visual (wrapped) lines: the result appears on the first visual line and empty slots appear on continuation lines, with the results array having one entry per visual line.
- The results panel is line-synchronized to CodeMirror scrolling via direct DOM access to `.cm-scroller`; changes to editor layout, line height, or padding can desync results.
- Numeric shorthand handling (`k`, `m`, `b`) and comment stripping are duplicated for full-line evaluation and selection-popup evaluation; keep behavior aligned when changing expression parsing.
- **Line references** (`$1`, `$-1`, etc.): `resolveLineReferences` rewrites `$1` → `_L1` (a scope variable name). `processLines` stores each line's raw mathjs result in `scope._L{lineNum}` after evaluation, so line refs work with any result type (numbers, units, fractions). Unresolved `$` refs (forward, out-of-range) stay as-is; the `$`-detection check then bails. Selection popup eval works the same way — scope already has `_L{N}` from the main pass.
- **Cross-tab `ref()`**: A `refFn` closure is seeded into the Math.js scope on each evaluation pass. After evaluation, the scope is saved to `tabScopesRef.current[activeTab.title]` for other tabs to read. `ref("tab name", "var name")` returns the variable value (number, unit, or any mathjs type) if found, else `NaN`. Currency units and other complex types pass through unaltered, so `ref("tab", "salary") to eur` works.

## Deployment
- Pushes to `main` trigger `.github/workflows/pages-deployment.yaml`, which builds with Node 20 and publishes `dist` to Cloudflare Pages project `notecal`.
