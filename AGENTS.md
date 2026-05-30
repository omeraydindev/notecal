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
- Tailwind CSS v4 is wired through `@tailwindcss/vite` in `vite.config.ts` and imported from `src/index.css`; there is no separate Tailwind config file.
- Google OAuth + Drive sync is provided by `src/auth.tsx` (`GoogleAuthProvider`, `useGoogleAuth`), `src/drive.ts` (Drive API save/load), and `src/usePreventLeave.ts` (blocks tab close during sync). Env vars (`VITE_DRIVE_SYNC_ENABLED`, `VITE_GOOGLE_CLIENT_ID`, `VITE_AUTH_API`) are wired in `src/main.tsx`. The authorization code flow is used with a Cloudflare Worker backend (`worker/`) for code exchange and token refresh.
- Tooltips use `react-tooltip` via a shared `<Tooltip id="header-tooltip">` in `App.tsx`; anchor elements use `data-tooltip-id` + `data-tooltip-content`.

## Runtime Gotchas
- Math evaluation depends on loading Math.js from `https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.8.0/math.min.js` at runtime; it is intentionally not imported from npm.
- Currency conversion functions are generated only after text contains a zero-argument pattern like `usd_to_try()` and rates are fetched from `https://open.er-api.com/v6/latest/USD`.
- Tabs persist in `localStorage` under `notecal-tabs`; legacy single-note text may exist under `notecal-text` and is migrated as a fallback. Font size persists under `notecal-fontSize`; word wrap preference persists under `notecal-wordWrap`; theme follows `prefers-color-scheme` and is not persisted.
- When word wrap is enabled, the results panel aligns with visual (wrapped) lines: the result appears on the first visual line and empty slots appear on continuation lines, with the results array having one entry per visual line.
- The results panel is line-synchronized to CodeMirror scrolling via direct DOM access to `.cm-scroller`; changes to editor layout, line height, or padding can desync results.
- Numeric shorthand handling (`k`, `m`, `b`) and comment stripping are duplicated for full-line evaluation and selection-popup evaluation; keep behavior aligned when changing expression parsing.

## Deployment
- Pushes to `main` trigger `.github/workflows/pages-deployment.yaml`, which builds with Node 20 and publishes `dist` to Cloudflare Pages project `notecal`.
- The `worker/` directory is a separate Cloudflare Worker; deploy it manually with `npx wrangler deploy` from `worker/`.
