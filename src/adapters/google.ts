import { googleDue, googleNotes } from "../destination-text";
import type { NormList, NormTask, Snapshot, Step } from "../model";
import type { WriteAdapter } from "./adapter";
import { HttpClient } from "./http";

const BASE = "https://tasks.googleapis.com/tasks/v1";
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/tasks";

interface GTask {
  id: string;
  title?: string;
  status?: string;
  due?: string;
  parent?: string;
}
interface GPage {
  items?: GTask[];
  nextPageToken?: string;
}

export function createGoogleAdapter(accessToken: string, fetchImpl?: typeof fetch): WriteAdapter {
  const http = new HttpClient({ minIntervalMs: 200, fetchImpl }, async () => ({ Authorization: `Bearer ${accessToken}` }));

  async function insert(listId: string, body: Record<string, unknown>, parent?: string): Promise<string> {
    const q = parent ? `?parent=${encodeURIComponent(parent)}` : "";
    return (await http.json<GTask>(`${BASE}/lists/${encodeURIComponent(listId)}/tasks${q}`, { method: "POST", body })).id;
  }

  return {
    id: "googleTasks",
    async createList(list: NormList): Promise<string> {
      return (await http.json<{ id: string }>(`${BASE}/users/@me/lists`, { method: "POST", body: { title: list.name } })).id;
    },
    createTask(listId: string, t: NormTask): Promise<string> {
      const notes = googleNotes(t).text;
      return insert(listId, {
        title: t.title, status: t.completed ? "completed" : "needsAction",
        ...(notes ? { notes } : {}), ...(googleDue(t) ? { due: googleDue(t) } : {}),
      });
    },
    createStep(listId: string, parentId: string, s: Step): Promise<string> {
      return insert(listId, { title: s.title, status: s.checked ? "completed" : "needsAction" }, parentId);
    },
    async readBack(listIds: string[]): Promise<Map<string, Snapshot>> {
      const out = new Map<string, Snapshot>();
      for (const id of listIds) {
        const all: GTask[] = [];
        let token: string | undefined;
        do {
          const q = new URLSearchParams({ maxResults: "100", showCompleted: "true", showHidden: "true" });
          if (token) q.set("pageToken", token);
          const page: GPage = await http.json(`${BASE}/lists/${encodeURIComponent(id)}/tasks?${q}`);
          all.push(...(page.items ?? []));
          token = page.nextPageToken;
        } while (token);
        const kids = new Map<string, number>();
        for (const t of all) if (t.parent) kids.set(t.parent, (kids.get(t.parent) ?? 0) + 1);
        for (const t of all) {
          out.set(t.id, {
            title: t.title ?? "", completed: t.status === "completed",
            dueDate: t.due ? t.due.slice(0, 10) : null, stepCount: kids.get(t.id) ?? 0,
          });
        }
      }
      return out;
    },
  };
}
