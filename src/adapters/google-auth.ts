import { GOOGLE_SCOPE } from "./google";

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type?: string; message?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

const GSI = "https://accounts.google.com/gsi/client";

export function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in (accounts.google.com/gsi/client)."));
    document.head.appendChild(s);
  });
}

/** Must be called from a click handler so the popup is allowed. The token stays in memory. */
export async function requestGoogleToken(clientId: string): Promise<string> {
  await loadGoogleScript();
  const g = window.google;
  if (!g) throw new Error("Google sign-in did not load.");
  return new Promise((resolve, reject) => {
    const tc = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description ?? r.error ?? "Google sign-in failed"))),
      error_callback: (e) => reject(new Error(e.message ?? e.type ?? "Google sign-in was closed")),
    });
    tc.requestAccessToken();
  });
}
