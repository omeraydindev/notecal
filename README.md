# NoteCal

A notepad-style calculator. Type math expressions, see results instantly.

```
income = 5k
rent = 1.2k
savings = income - rent    // 3,800
```

**Features:**
- Variables and math functions
- Shorthand multipliers (k, m, b)
- Built-in functions for live currency conversion (`usd_to_try()`, `eur_to_usd()`, etc.)
- Multiple note tabs with persisted titles and content
- Line and block comments (`//`, `/* ... */`)
- Instant result popup on text selection
- Syntax highlighting
- Dark/light mode
- Word wrapping
- Auto-saves to localStorage
- Google Drive sync (sign-in with OAuth, auto-saves on change, loads on sign-in)

Built with React, TypeScript, CodeMirror 6, and Math.js.

## Google Drive Sync

Requires three env vars in `.env`:

```env
VITE_DRIVE_SYNC_ENABLED=true
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_AUTH_API=https://notecal-auth.your-subdomain.workers.dev
```

### Setup

1. Create an OAuth 2.0 Web Client ID at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Enable the Google Drive API for your project
3. Add your app's origin(s) to **Authorized JavaScript origins**
4. Generate a **Client Secret** for this client ID
5. Deploy the auth worker (`worker/`) - see [worker/README.md](worker/README.md)
6. Set the worker URL as `VITE_AUTH_API`

The authorization code flow is used (not the implicit token flow). Access tokens are refreshed silently via the worker, so the user only sees a Google popup once during initial sign-in.
