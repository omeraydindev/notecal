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
- Line result references (`$1`, `$-1`, etc.) - reuse any previous line's result by number
- Cross-tab variable references (`ref("Tab Name", "var")`) - use variables defined in other tabs
- Syntax highlighting
- Dark/light mode
- Word wrapping
- Auto-saves to localStorage
- Google Drive sync (sign-in with OAuth, auto-saves on change, loads on sign-in)

Built with React, TypeScript, CodeMirror 6, and Math.js.

## Line References

Refer to any previous line's result by its line number (1-based):

```
revenue = 50000
cogs = 30000
gross = $1 - $2                      // 20,000
tax = gross * 0.20                   // 4,000  (variables still work too)
net = $3 - $4                        // 16,000
```

Relative references use negative numbers: `$-1` for previous line, `$-2` for two lines above.

```
list_price = 100
discount = $-1 * 0.10                // 10
final = $1 - $-1                     // 90
```

## Cross-Tab References

Access variables from other tabs with `ref("tab title", "variable name")`:

```
// Tab "constants"
tax_rate = 0.15
shipping = 5.99

// Tab "orders"
price = 49.99
total = price + ref("constants", "shipping")
with_tax = total * (1 + ref("constants", "tax_rate"))
```

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
