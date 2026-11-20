import type { NormList, NormTask, Snapshot, Step } from "../model";
import type { ReadBack, WriteAdapter } from "./adapter";
import { HttpClient, HttpError } from "./http";
import { createOnce } from "./recover";
import { isContentRejection, taskVariants } from "./todoist-create";

const BASE = "https://api.todoist.com/api/v1";

interface TodoistTask {
  id: string;
  content: string;
  parent_id: string | null;
  priority: number;
  checked?: boolean;
  due: { date: string; is_recurring: boolean } | null;
}
interface Paged<T> {
  results: T[];
  next_cursor: string | null;
}

/** The token lives only in this closure: never written to storage. */
export function createTodoistAdapter(apiToken: string, fetchImpl?: typeof fetch): WriteAdapter {
  const http = new HttpClient({ minIntervalMs: 250, fetchImpl }, async () => ({ Authorization: `Bearer ${apiToken}` }));
  const warnings: string[] = [];
  const createdIds = new Set<string>();
  let existingProjects: Map<string, string> | null = null;

  async function paged<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({ ...params, limit: "200" });
      if (cursor) q.set("cursor", cursor);
      const page: Paged<T> = await http.json(`${BASE}${path}?${q}`);
      out.push(...page.results);
      cursor = page.next_cursor;
    } while (cursor);
    return out;
  }

  // Todoist v1 documents no idempotency key for REST creates (only Sync command UUIDs), so a failed-in-transit
  // create is looked up by content and parent before it is repeated. See docs/api-notes.md.
  async function post(body: Record<string, unknown>, projectId: string): Promise<string> {
    const label = String(body.content);
    return createOnce(
      async () => {
        const made = await http.json<{ id: string }>(`${BASE}/tasks`, { method: "POST", body });
        createdIds.add(made.id);
        return made.id;
      },
      async () => {
        const mine = await paged<TodoistTask>("/tasks", { project_id: projectId });
        return mine.find((t) => t.content === label && (t.parent_id ?? null) === ((body.parent_id as string | undefined) ?? null) && !createdIds.has(t.id))?.id;
      },
      (m) => warnings.push(m), label,
    );
  }

  const snap = (t: TodoistTask, kids: number, completed: boolean): Snapshot => ({
    title: t.content, priority: t.priority, dueDate: t.due?.date.slice(0, 10) ?? null,
    recurring: t.due?.is_recurring ?? false, stepCount: kids, completed,
  });

  return {
    id: "todoist",
    warnings,
    async createList(list: NormList): Promise<string> {
      existingProjects ??= new Map((await paged<{ id: string; name: string }>("/projects", {})).map((p) => [p.name, p.id]));
      const reuse = existingProjects.get(list.name);
      if (reuse) {
        existingProjects.delete(list.name);
        warnings.push(`Project "${list.name}" already exists in Todoist, so it was reused. Tasks already in it were left alone and may now be duplicated.`);
        return reuse;
      }
      return (await http.json<{ id: string }>(`${BASE}/projects`, { method: "POST", body: { name: list.name } })).id;
    },
    async createTask(projectId: string, t: NormTask): Promise<string> {
      let last: unknown;
      for (const v of taskVariants(t, projectId)) {
        try {
          const id = await post(v.body, projectId);
          if (v.fallback) warnings.push(`"${t.title}": ${v.fallback}.`);
          return id;
        } catch (e) {
          last = e;
          if (!isContentRejection(e)) throw e;
        }
      }
      throw last;
    },
    createStep(projectId: string, parentId: string, s: Step): Promise<string> {
      return post({ content: s.title, project_id: projectId, parent_id: parentId }, projectId);
    },
    async closeTask(id: string): Promise<void> {
      await http.json(`${BASE}/tasks/${id}/close`, { method: "POST", idempotent: true });
    },
    async readBack(projectIds: string[], completedIds: string[]): Promise<ReadBack> {
      const out: ReadBack = { tasks: new Map(), listCounts: new Map() };
      for (const pid of projectIds) {
        const tasks = await paged<TodoistTask>("/tasks", { project_id: pid });
        const kids = new Map<string, number>();
        for (const t of tasks) if (t.parent_id) kids.set(t.parent_id, (kids.get(t.parent_id) ?? 0) + 1);
        for (const t of tasks) out.tasks.set(t.id, snap(t, kids.get(t.id) ?? 0, false));
        out.listCounts.set(pid, tasks.filter((t) => !t.parent_id).length);
      }
      for (const id of completedIds) {
        try {
          const t = await http.json<TodoistTask>(`${BASE}/tasks/${id}`);
          out.tasks.set(id, { ...snap(t, 0, t.checked === true), stepCount: undefined });
        } catch (e) {
          if (!(e instanceof HttpError) || e.status !== 404) throw e; // 404 = not found = missing
        }
      }
      return out;
    },
  };
}
