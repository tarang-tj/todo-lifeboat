import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import { ReauthRequiredError } from "../errors";
import type { GraphPage } from "../graph-types";
import type { NormList } from "../model";
import { preferTimezone, userZone } from "../tz";
import { createGraphReader } from "./graph-read";
import { HttpClient } from "./http";
import { msalConfig } from "./msal-config";

export const SCOPES = ["Tasks.Read"];

let pca: PublicClientApplication | null = null;
let account: AccountInfo | null = null;

async function client(clientId: string): Promise<PublicClientApplication> {
  if (!pca) {
    pca = new PublicClientApplication(msalConfig(clientId, window.location.href));
    await pca.initialize();
  }
  return pca;
}

/** Must run inside a click handler: it opens a popup. */
export async function signIn(clientId: string): Promise<string> {
  const app = await client(clientId);
  const res = await app.loginPopup({ scopes: SCOPES });
  account = res.account;
  return res.account.homeAccountId;
}
export const accountName = (): string => account?.username ?? "";

export async function signOut(): Promise<void> {
  const app = pca;
  account = null;
  pca = null;
  await app?.clearCache().catch(() => undefined);
}

async function token(): Promise<string> {
  if (!pca || !account) throw new ReauthRequiredError();
  try {
    return (await pca.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch (e) {
    // Never open a popup here: we are not inside a user gesture. Ask the UI for a Re-authorize click.
    if (e instanceof InteractionRequiredAuthError) throw new ReauthRequiredError();
    throw e;
  }
}

const zone = userZone();
// Asks Graph to return dateTimeTimeZone values in the user's zone. Header form UNVERIFIED for To Do (docs/api-notes.md).
const http = new HttpClient({ minIntervalMs: 50 }, async () => ({
  Authorization: `Bearer ${await token()}`,
  Prefer: preferTimezone(zone),
}));

const reader = createGraphReader(<T>(url: string) => http.json<GraphPage<T>>(url));
export const loadAll = (onProgress: (msg: string) => void): Promise<NormList[]> => reader.loadAll(onProgress);
