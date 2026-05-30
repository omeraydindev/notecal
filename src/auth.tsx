import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';

export interface AuthState {
  token: string | null;
  isSignedIn: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: () => void;
  signOut: () => void;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GIS_URL = 'https://accounts.google.com/gsi/client';
const ACCESS_TOKEN_KEY = 'notecal-access-token';
const REFRESH_TOKEN_KEY = 'notecal-refresh-token';

export function GoogleAuthProvider({
  clientId,
  scope,
  authApi,
  children,
}: {
  clientId: string;
  scope: string;
  authApi: string;
  children: ReactNode;
}) {
  const ready = clientId && authApi;

  const [state, setState] = useState<AuthState>(() => {
    if (!ready) return { token: null, isSignedIn: false, isLoading: false };
    const stored = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (stored) {
      try {
        const { token, expiresAt } = JSON.parse(stored);
        if (Date.now() < expiresAt) {
          return { token, isSignedIn: true, isLoading: false };
        }
      } catch {
        // invalid stored data
      }
    }
    const hasRefresh = !!localStorage.getItem(REFRESH_TOKEN_KEY);
    return { token: null, isSignedIn: false, isLoading: hasRefresh };
  });

  const codeClientRef = useRef<google.accounts.oauth2.CodeClient | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const mountedRef = useRef(true);

  const setTokens = useCallback((accessToken: string, expiresIn: number, refreshToken?: string) => {
    const expiresAt = Date.now() + (expiresIn ?? 3600) * 1000;
    localStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify({ token: accessToken, expiresAt }));
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
    if (mountedRef.current) {
      setState({ token: accessToken, isSignedIn: true, isLoading: false });
    }
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    if (mountedRef.current) {
      setState({ token: null, isSignedIn: false, isLoading: false });
    }
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    refreshPromiseRef.current = (async () => {
      const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!rt) return null;

      try {
        const res = await fetch(`${authApi}/api/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          clearTokens();
          return null;
        }
        const data = await res.json();
        setTokens(data.access_token, data.expires_in);
        return data.access_token;
      } catch {
        return null;
      }
    })();

    const result = await refreshPromiseRef.current;
    refreshPromiseRef.current = null;
    return result;
  }, [authApi, clearTokens, setTokens]);

  const handleCodeResponse = useCallback(
    async (response: google.accounts.oauth2.CodeResponse) => {
      if (response.error) {
        clearTokens();
        return;
      }

      try {
        const res = await fetch(`${authApi}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: response.code, redirectUri: window.location.origin }),
        });
        if (!res.ok) {
          clearTokens();
          return;
        }
        const data = await res.json();
        setTokens(data.access_token, data.expires_in, data.refresh_token);
      } catch {
        clearTokens();
      }
    },
    [authApi, clearTokens, setTokens],
  );

  const signIn = useCallback(() => {
    codeClientRef.current?.requestCode();
  }, []);

  const signOut = useCallback(() => {
    if (state.token && window.google) {
      google.accounts.oauth2.revoke(state.token);
    }
    clearTokens();
  }, [state.token, clearTokens]);

  // Silent refresh on page load if refresh token exists
  useEffect(() => {
    mountedRef.current = true;
    if (state.isLoading && localStorage.getItem(REFRESH_TOKEN_KEY)) {
      refreshAccessToken();
    }
    return () => { mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;

    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.onload = () => {
      codeClientRef.current = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope,
        ux_mode: 'popup',
        callback: handleCodeResponse,
      });
      if (!localStorage.getItem(REFRESH_TOKEN_KEY)) {
        setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev));
      }
    };
    script.onerror = () => {
      console.warn('Failed to load Google Identity Services');
      setState((prev) => ({ ...prev, isLoading: false }));
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [ready, clientId, scope, handleCodeResponse]);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshToken: refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGoogleAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useGoogleAuth must be used within GoogleAuthProvider');
  return ctx;
}
