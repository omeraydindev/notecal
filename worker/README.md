# notecal-auth-worker

Cloudflare Worker that exchanges authorization codes for tokens and refreshes access tokens for NoteCal's Google Drive sync.

## Deployment

```bash
npx wrangler deploy
```

## Secrets

Set these in your GitHub repo:

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (already used by frontend workflow) |
| `GOOGLE_CLIENT_ID` | Your OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your OAuth client secret |

For local deploys, use `npx wrangler secret put <NAME>`.

## Google Cloud Console Setup

1. Go to [Google Cloud Console > APIs & Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Web Client ID
3. Add your app's origin to **Authorized JavaScript origins** (e.g., `http://localhost:5173`, `https://notecal.pages.dev`)
4. Note the **Client Secret**; this is `GOOGLE_CLIENT_SECRET`
