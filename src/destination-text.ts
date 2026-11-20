import { datePart, hasTimeOfDay, trimToSeconds } from "./dates";
import type { NormTask } from "./model";
import { recurrenceToText, recurrenceToTodoist } from "./recurrence";

export const GOOGLE_NOTES_MAX = 8192; // Task.notes limit, see docs/api-notes.md

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function plainBody(t: NormTask): string {
  if (t.bodyType !== "html") return t.body.trim();
  return t.body
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The repeat rule as a Todoist due_string, or null when the destination cannot express it. */
export function todoistRecurrence(t: NormTask): string | null {
  return t.recurrence ? recurrenceToTodoist(t.recurrence) : null;
}

export function todoistDescription(t: NormTask): string {
  const parts = [plainBody(t)];
  if (t.recurrence && !todoistRecurrence(t)) parts.push(recurrenceToText(t.recurrence));
  return parts.filter(Boolean).join("\n\n");
}

export function googleNotes(t: NormTask): { text: string; truncated: boolean } {
  const parts = [plainBody(t)];
  if (t.recurrence) parts.push(recurrenceToText(t.recurrence));
  if (t.categories.length) parts.push(`Categories: ${t.categories.join(", ")}`);
  const full = parts.filter(Boolean).join("\n\n");
  return full.length > GOOGLE_NOTES_MAX
    ? { text: full.slice(0, GOOGLE_NOTES_MAX), truncated: true }
    : { text: full, truncated: false };
}

/** Google Tasks `due`: RFC 3339, time discarded by the API. */
export function googleDue(t: NormTask): string | undefined {
  const d = datePart(t.dueDateTime);
  return d ? `${d}T00:00:00.000Z` : undefined;
}

/** Exactly one due field for Todoist, so the API never sees conflicting due inputs. */
export function todoistDuePayload(t: NormTask): Record<string, string> {
  const rule = todoistRecurrence(t);
  if (rule) return { due_string: rule };
  const d = datePart(t.dueDateTime);
  if (!d || !t.dueDateTime) return {};
  return hasTimeOfDay(t.dueDateTime) ? { due_datetime: trimToSeconds(t.dueDateTime) } : { due_date: d };
}

export function todoistPriority(t: NormTask): number {
  return t.importance === "high" ? 4 : 1;
}
