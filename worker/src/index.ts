const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

async function tokenExchange(body: URLSearchParams): Promise<Response> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const { code, redirectUri, refreshToken } = await request.json() as Record<string, string>;

    if (url.pathname === '/api/auth' && code) {
      return tokenExchange(
        new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri || '',
          grant_type: 'authorization_code',
        }),
      );
    }

    if (url.pathname === '/api/refresh' && refreshToken) {
      return tokenExchange(
        new URLSearchParams({
          refresh_token: refreshToken,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      );
    }

    return new Response('Not found', { status: 404 });
  },
};
