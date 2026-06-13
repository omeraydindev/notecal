const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const ALLOWED_ORIGINS = ['https://notecal.omeraydin.dev', 'http://localhost:5173'];

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  return {};
}

function respond(
  body: BodyInit | null,
  init: ResponseInit & { request: Request },
): Response {
  const { request, ...rest } = init;
  return new Response(body, {
    ...rest,
    headers: { ...rest.headers, ...corsHeaders(request) },
  });
}

interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

async function tokenExchange(
  body: URLSearchParams,
  request: Request,
): Promise<Response> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  let data: unknown;
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = { error: 'unexpected_response', text };
  }

  return respond(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
    request,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return respond(null, { status: 204, headers: {}, request });
    }
    if (request.method !== 'POST') {
      return respond('Method not allowed', { status: 405, headers: {}, request });
    }

    const url = new URL(request.url);

    let body: Record<string, string>;
    try {
      body = await request.json() as Record<string, string>;
    } catch {
      return respond(JSON.stringify({ error: 'invalid_json' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        request,
      });
    }

    const { code, redirectUri, refreshToken } = body;

    if (url.pathname === '/api/auth' && code) {
      return tokenExchange(
        new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri || '',
          grant_type: 'authorization_code',
        }),
        request,
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
        request,
      );
    }

    return respond('Not found', { status: 404, headers: {}, request });
  },
};
