declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
    error?: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message: string }) => void;
  }

  interface TokenClient {
    requestAccessToken: (config?: { prompt?: string }) => void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function revoke(token: string, callback?: () => void): void;
}

declare namespace google.accounts.id {
  interface IdConfiguration {
    client_id: string;
    callback?: (response: CredentialResponse) => void;
  }

  interface CredentialResponse {
    credential: string;
  }

  function initialize(config: IdConfiguration): void;
  function renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; text?: string }
  ): void;
}

interface Window {
  google?: typeof google;
}
