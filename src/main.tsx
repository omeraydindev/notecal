import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { GoogleAuthProvider } from './auth';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleAuthProvider clientId={GOOGLE_CLIENT_ID} scope={DRIVE_SCOPE}>
      <App />
    </GoogleAuthProvider>
  </StrictMode>,
);
