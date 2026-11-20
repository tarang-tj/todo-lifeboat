import type { Configuration } from "@azure/msal-browser";
import { redirectUri } from "./redirect-uri";

/** Tokens stay in memory only; sign-in popups return through the redirect bridge page. */
export function msalConfig(clientId: string, pageHref: string): Configuration {
  return {
    auth: { clientId, authority: "https://login.microsoftonline.com/common", redirectUri: redirectUri(pageHref) },
    cache: { cacheLocation: "memoryStorage" },
  };
}
