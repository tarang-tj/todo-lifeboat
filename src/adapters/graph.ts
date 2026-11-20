import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import type { GraphList, GraphPage, GraphTask, GraphChecklistItem } from "../graph-types";
import { mapList } from "../mapper";
import type { NormList } from "../model";
import { HttpClient, HttpError } from "./http";
import { pageAll as pagedFetch } from "./paging";

const GRAPH = "https://graph.microsoft.com/v1.0";
export const SCOPES = ["Tasks.Read"];

let pca: PublicClientApplication | null = null;
let account: AccountInfo | null = null;

async function client(clientId: string): Promise<PublicClientApplication> {
  if (!pca) {
    pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await pca.initialize();
  }
  return pca;
}

export async function signIn(clientId: string): Promise<string> {
  const app = await client(clientId);
  const res = await app.loginPopup({ scopes: SCOPES });
  account = res.account;
  return res.account.username;
}

export function signOut(): void {
  account = null;
  pca = null;
}

async function token(): Promise<string> {
  if (!pca || !account) throw new Error("Not signed in to Microsoft");
  const res = await pca.acquireTokenSilent({ scopes: SCOPES, account }).catch(() => pca!.acquireTokenPopup({ scopes: SCOPES, account: account! }));
  return res.accessToken;
}

const http = new HttpClient({ minIntervalMs: 50 }, async () => ({ Authorization: `Bearer ${await token()}` }));

const pageAll = <T>(url: string): Promise<T[]> => pagedFetch<T>(url, (u) => http.json<GraphPage<T>>(u));

async function listTasks(listId: string): Promise<GraphTask[]> {
  const base = `${GRAPH}/me/todo/lists/${encodeURIComponent(listId)}/tasks`;
  try {
    return await pageAll<GraphTask>(`${base}?$expand=checklistItems,linkedResources`);
  } catch (e) {
    // UNVERIFIED: $expand support. Fall back to plain list plus per-task steps.
    if (!(e instanceof HttpError) || e.status !== 400) throw e;
  }
  const tasks = await pageAll<GraphTask>(base);
  for (const t of tasks) {
    if (t.checklistItems === undefined) {
      t.checklistItems = await pageAll<GraphChecklistItem>(`${base}/${encodeURIComponent(t.id)}/checklistItems`);
    }
  }
  return tasks;
}

export async function loadAll(onProgress: (msg: string) => void): Promise<NormList[]> {
  const lists = await pageAll<GraphList>(`${GRAPH}/me/todo/lists`);
  const out: NormList[] = [];
  for (const [i, l] of lists.entries()) {
    onProgress(`Reading list ${i + 1} of ${lists.length}: ${l.displayName ?? ""}`);
    out.push(mapList(l, await listTasks(l.id)));
  }
  return out;
}
