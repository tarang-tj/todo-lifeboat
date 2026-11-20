import type { GraphChecklistItem, GraphLinkedResource, GraphList, GraphPage, GraphTask } from "../graph-types";
import { mapList } from "../mapper";
import type { NormList } from "../model";
import { HttpError } from "./http";
import { pageAll } from "./paging";

export const GRAPH = "https://graph.microsoft.com/v1.0";
export type GetPage = <T>(url: string) => Promise<GraphPage<T>>;

/** Reads every list and task. The $expand decision is made once and reused for the rest of the run. */
export function createGraphReader(get: GetPage) {
  let expandSupported: boolean | undefined;
  const all = <T>(url: string): Promise<T[]> => pageAll<T>(url, (u) => get<T>(u));

  async function listTasks(listId: string): Promise<GraphTask[]> {
    const base = `${GRAPH}/me/todo/lists/${encodeURIComponent(listId)}/tasks`;
    if (expandSupported !== false) {
      try {
        const tasks = await all<GraphTask>(`${base}?$expand=checklistItems,linkedResources`);
        expandSupported = true;
        return tasks;
      } catch (e) {
        // UNVERIFIED: $expand support. 400 or 501 means not supported: remember it, use per-task calls.
        if (!(e instanceof HttpError) || (e.status !== 400 && e.status !== 501)) throw e;
        expandSupported = false;
      }
    }
    const tasks = await all<GraphTask>(base);
    for (const t of tasks) {
      const own = `${base}/${encodeURIComponent(t.id)}`;
      if (t.checklistItems === undefined) t.checklistItems = await all<GraphChecklistItem>(`${own}/checklistItems`);
      if (t.linkedResources === undefined) {
        try {
          t.linkedResources = await all<GraphLinkedResource>(`${own}/linkedResources`);
        } catch (e) {
          if (!(e instanceof HttpError) || [401, 403, 429].includes(e.status)) throw e;
          t.linkedResourcesUnknown = true; // the preview says the count is unknown
        }
      }
    }
    return tasks;
  }

  return {
    async loadAll(onProgress: (msg: string) => void): Promise<NormList[]> {
      const lists = await all<GraphList>(`${GRAPH}/me/todo/lists`);
      const out: NormList[] = [];
      for (const [i, l] of lists.entries()) {
        onProgress(`Reading list ${i + 1} of ${lists.length}: ${l.displayName ?? ""}`);
        out.push(mapList(l, await listTasks(l.id)));
      }
      return out;
    },
  };
}
