import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { GoogleAuthProvider } from './auth';

const DRIVE_SYNC = import.meta.env.VITE_DRIVE_SYNC_ENABLED === 'true';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const AUTH_API = import.meta.env.VITE_AUTH_API || '';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const authEnabled = DRIVE_SYNC && !!GOOGLE_CLIENT_ID && !!AUTH_API;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleAuthProvider clientId={authEnabled ? GOOGLE_CLIENT_ID : ''} scope={DRIVE_SCOPE} authApi={authEnabled ? AUTH_API : ''}>
      <App />
    </GoogleAuthProvider>
  </StrictMode>,
);
