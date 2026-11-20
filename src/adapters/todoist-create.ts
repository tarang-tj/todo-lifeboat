import { todoistDescription, todoistDuePayload, todoistPriority } from "../destination-text";
import { datePart } from "../dates";
import type { NormTask } from "../model";
import { recurrenceToText } from "../recurrence";
import { HttpError } from "./http";

export interface Variant {
  body: Record<string, unknown>;
  /** null for the full request; otherwise what was dropped. */
  fallback: string | null;
}

/** Full request first, then staged fallbacks: drop the repeat phrase, then drop labels. */
export function taskVariants(t: NormTask, projectId: string): Variant[] {
  const desc = todoistDescription(t);
  const base: Record<string, unknown> = { content: t.title, project_id: projectId, priority: todoistPriority(t), ...todoistDuePayload(t) };
  if (desc) base.description = desc;
  const full = t.categories.length ? { ...base, labels: t.categories } : base;
  const out: Variant[] = [{ body: full, fallback: null }];
  let cur = full;
  if ("due_string" in cur) {
    const { due_string: _drop, ...rest } = cur;
    const date = datePart(t.dueDateTime);
    const text = t.recurrence ? recurrenceToText(t.recurrence) : "";
    cur = { ...rest, ...(date ? { due_date: date } : {}), description: [desc, text].filter(Boolean).join("\n\n") };
    out.push({ body: cur, fallback: "repeat phrase rejected; sent the due date and kept the rule as text in the description" });
  }
  if (t.categories.length) {
    const { labels: _drop, ...rest } = cur;
    const text = `Labels: ${t.categories.join(", ")}`;
    out.push({ body: { ...rest, description: [rest.description, text].filter(Boolean).join("\n\n") }, fallback: "labels rejected; kept as text in the description" });
  }
  return out;
}

/** 4xx the API rejected on content; auth, not-found and rate-limit errors are never worked around. */
export function isContentRejection(e: unknown): boolean {
  return e instanceof HttpError && e.status >= 400 && e.status < 500 && ![401, 403, 404, 429].includes(e.status);
}
