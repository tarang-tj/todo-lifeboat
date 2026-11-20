import { googleDue, googleNotes } from "../destination-text";
import type { NormList, NormTask, Step } from "../model";
import type { ReadBack, WriteAdapter } from "./adapter";
import { HttpClient } from "./http";
import { createOnce } from "./recover";

const BASE = "https://tasks.googleapis.com/tasks/v1";
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/tasks";

interface GTask {
  id: string;
  title?: string;
  status?: string;
  due?: string;
  parent?: string;
}
interface GPage<T> {
  items?: T[];
  nextPageToken?: string;
}

export function createGoogleAdapter(accessToken: string, fetchImpl?: typeof fetch): WriteAdapter {
  const http = new HttpClient({ minIntervalMs: 200, fetchImpl }, async () => ({ Authorization: `Bearer ${accessToken}` }));
  const warnings: string[] = [];
  const createdIds = new Set<string>();
  let existingLists: Map<string, string> | null = null;

  async function paged<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let token: string | undefined;
    do {
      const q = new URLSearchParams(params);
      if (token) q.set("pageToken", token);
      const page: GPage<T> = await http.json(`${BASE}${path}?${q}`);
      out.push(...(page.items ?? []));
      token = page.nextPageToken;
    } while (token);
    return out;
  }
  const listTasks = (listId: string): Promise<GTask[]> =>
    paged<GTask>(`/lists/${encodeURIComponent(listId)}/tasks`, { maxResults: "100", showCompleted: "true", showHidden: "true" });

  /** `previous` keeps order: without it Google puts the new task first. */
  function insert(listId: string, body: Record<string, unknown> & { title: string }, parent?: string, previous?: string): Promise<string> {
    const q = new URLSearchParams();
    if (parent) q.set("parent", parent);
    if (previous) q.set("previous", previous);
    const url = `${BASE}/lists/${encodeURIComponent(listId)}/tasks${q.size ? `?${q}` : ""}`;
    return createOnce(
      async () => {
        const made = await http.json<GTask>(url, { method: "POST", body });
        createdIds.add(made.id);
        return made.id;
      },
      async () => (await listTasks(listId)).find((t) => t.title === body.title && (t.parent ?? undefined) === parent && !createdIds.has(t.id))?.id,
      (m) => warnings.push(m), body.title,
    );
  }

  return {
    id: "googleTasks",
    warnings,
    async createList(list: NormList): Promise<string> {
      existingLists ??= new Map((await paged<{ id: string; title: string }>("/users/@me/lists", { maxResults: "1000" })).map((l) => [l.title, l.id]));
      const reuse = existingLists.get(list.name);
      if (reuse) {
        existingLists.delete(list.name);
        warnings.push(`Task list "${list.name}" already exists in Google Tasks, so it was reused. Tasks already in it were left alone and may now be duplicated.`);
        return reuse;
      }
      return (await http.json<{ id: string }>(`${BASE}/users/@me/lists`, { method: "POST", body: { title: list.name } })).id;
    },
    createTask(listId: string, t: NormTask, previousId?: string): Promise<string> {
      const notes = googleNotes(t).text;
      const due = googleDue(t);
      return insert(listId, {
        title: t.title, status: t.completed ? "completed" : "needsAction",
        ...(notes ? { notes } : {}), ...(due ? { due } : {}),
      }, undefined, previousId);
    },
    createStep(listId: string, parentId: string, s: Step, previousId?: string): Promise<string> {
      return insert(listId, { title: s.title, status: s.checked ? "completed" : "needsAction" }, parentId, previousId);
    },
    async readBack(listIds: string[]): Promise<ReadBack> {
      const out: ReadBack = { tasks: new Map(), listCounts: new Map() };
      for (const id of listIds) {
        const all = await listTasks(id);
        const kids = new Map<string, number>();
        for (const t of all) if (t.parent) kids.set(t.parent, (kids.get(t.parent) ?? 0) + 1);
        for (const t of all) {
          out.tasks.set(t.id, {
            title: t.title ?? "", completed: t.status === "completed",
            dueDate: t.due ? t.due.slice(0, 10) : null, stepCount: kids.get(t.id) ?? 0,
          });
        }
        out.listCounts.set(id, all.filter((t) => !t.parent).length);
      }
      return out;
    },
  };
}
