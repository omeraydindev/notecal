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
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GIS_URL = 'https://accounts.google.com/gsi/client';
const STORAGE_KEY = 'notecal-google-token';

export function GoogleAuthProvider({
  clientId,
  scope,
  children,
}: {
  clientId: string;
  scope: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<AuthState>(() => {
    if (!clientId) return { token: null, isSignedIn: false, isLoading: false };
    const savedToken = localStorage.getItem(STORAGE_KEY);
    if (savedToken) return { token: savedToken, isSignedIn: true, isLoading: false };
    return { token: null, isSignedIn: false, isLoading: true };
  });
  const tokenClientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);

  const handleTokenResponse = useCallback(
    (response: google.accounts.oauth2.TokenResponse) => {
      if (response.error) {
        console.warn('Google auth error:', response.error);
        setState({ token: null, isSignedIn: false, isLoading: false });
        return;
      }
      localStorage.setItem(STORAGE_KEY, response.access_token);
      setState({ token: response.access_token, isSignedIn: true, isLoading: false });
    },
    [],
  );

  const signIn = useCallback(() => {
    if (!tokenClientRef.current) return;
    tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
  }, []);

  const signOut = useCallback(() => {
    if (state.token && window.google) {
      google.accounts.oauth2.revoke(state.token);
    }
    localStorage.removeItem(STORAGE_KEY);
    setState({ token: null, isSignedIn: false, isLoading: false });
  }, [state.token]);

  useEffect(() => {
    if (!clientId) return;

    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.onload = () => {
      tokenClientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope,
        callback: handleTokenResponse,
      });
      setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev));
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
  }, [clientId, scope, handleTokenResponse]);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
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
