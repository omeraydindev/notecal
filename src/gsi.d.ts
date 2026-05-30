declare namespace google.accounts.oauth2 {
  interface CodeResponse {
    code?: string;
    scope?: string;
    state?: string;
    error?: string;
    error_description?: string;
    error_uri?: string;
  }

  interface CodeClientConfig {
    client_id: string;
    scope: string;
    ux_mode: 'popup' | 'redirect';
    callback: (response: CodeResponse) => void;
    redirect_uri?: string;
  }

  interface CodeClient {
    requestCode: () => void;
  }

  function initCodeClient(config: CodeClientConfig): CodeClient;
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
