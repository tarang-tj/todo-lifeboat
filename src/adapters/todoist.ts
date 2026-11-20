import { todoistDescription, todoistDuePayload, todoistPriority } from "../destination-text";
import type { NormList, NormTask, Snapshot, Step } from "../model";
import type { WriteAdapter } from "./adapter";
import { HttpClient, HttpError } from "./http";

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
export function createTodoistAdapter(apiToken: string, fetchImpl?: typeof fetch): WriteAdapter & { warnings: string[] } {
  const http = new HttpClient({ minIntervalMs: 250, fetchImpl }, async () => ({ Authorization: `Bearer ${apiToken}` }));
  const warnings: string[] = [];

  const create = (body: Record<string, unknown>): Promise<TodoistTask> =>
    http.json<TodoistTask>(`${BASE}/tasks`, { method: "POST", body });

  async function createWithLabels(body: Record<string, unknown>, labels: string[], label: string): Promise<TodoistTask> {
    if (!labels.length) return create(body);
    try {
      return await create({ ...body, labels });
    } catch (e) {
      if (!(e instanceof HttpError) || e.status >= 500 || e.status === 429) throw e;
      // UNVERIFIED label auto-create: retry without labels, keep them as text.
      warnings.push(`Labels rejected for "${label}"; stored in the description instead (${e.status}).`);
      const desc = [body.description, `Labels: ${labels.join(", ")}`].filter(Boolean).join("\n\n");
      return create({ ...body, description: desc });
    }
  }

  async function close(id: string): Promise<void> {
    await http.json(`${BASE}/tasks/${id}/close`, { method: "POST" });
  }

  async function readAll(projectId: string): Promise<TodoistTask[]> {
    const out: TodoistTask[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({ project_id: projectId, limit: "200" });
      if (cursor) q.set("cursor", cursor);
      const page: Paged<TodoistTask> = await http.json(`${BASE}/tasks?${q}`);
      out.push(...page.results);
      cursor = page.next_cursor;
    } while (cursor);
    return out;
  }

  const snap = (t: TodoistTask, kids: number, completed?: boolean): Snapshot => ({
    title: t.content, priority: t.priority, dueDate: t.due?.date.slice(0, 10) ?? null,
    recurring: t.due?.is_recurring ?? false, stepCount: kids, ...(completed === undefined ? { completed: false } : { completed }),
  });

  return {
    id: "todoist",
    warnings,
    async createList(list: NormList): Promise<string> {
      return (await http.json<{ id: string }>(`${BASE}/projects`, { method: "POST", body: { name: list.name } })).id;
    },
    async createTask(projectId: string, t: NormTask): Promise<string> {
      const body: Record<string, unknown> = {
        content: t.title, project_id: projectId, priority: todoistPriority(t), ...todoistDuePayload(t),
      };
      const desc = todoistDescription(t);
      if (desc) body.description = desc;
      const made = await createWithLabels(body, t.categories, t.title);
      if (t.completed) await close(made.id);
      return made.id;
    },
    async createStep(projectId: string, parentId: string, s: Step): Promise<string> {
      const made = await create({ content: s.title, project_id: projectId, parent_id: parentId });
      if (s.checked) await close(made.id);
      return made.id;
    },
    async readBack(projectIds: string[], completedIds: string[]): Promise<Map<string, Snapshot>> {
      const out = new Map<string, Snapshot>();
      for (const pid of projectIds) {
        const tasks = await readAll(pid);
        const kids = new Map<string, number>();
        for (const t of tasks) if (t.parent_id) kids.set(t.parent_id, (kids.get(t.parent_id) ?? 0) + 1);
        for (const t of tasks) out.set(t.id, snap(t, kids.get(t.id) ?? 0));
      }
      for (const id of completedIds) {
        try {
          const t = await http.json<TodoistTask>(`${BASE}/tasks/${id}`);
          out.set(id, { ...snap(t, 0, t.checked === true), stepCount: undefined });
        } catch (e) {
          if (!(e instanceof HttpError) || e.status !== 404) throw e; // 404 = not found = missing
        }
      }
      return out;
    },
  };
}
