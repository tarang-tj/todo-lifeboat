import { FIELDS, FIELD_LABELS, fieldFate, hasField, type Fate, type FieldKey } from "./capabilities";
import type { DestId, NormList } from "./model";

export interface PreviewRow {
  field: FieldKey;
  label: string;
  total: number;
  kept: number;
  transformed: number;
  lost: number;
  /** note text -> task count, for the non-kept outcomes. */
  variants: Record<string, number>;
}
export interface TaskFlag {
  sourceId: string;
  title: string;
  list: string;
  items: { field: FieldKey; fate: Fate; note: string }[];
}
export interface Preview {
  dest: DestId;
  taskCount: number;
  listCount: number;
  rows: PreviewRow[];
  flags: TaskFlag[];
  /** Plan or data caveats shown above the table. */
  warnings: string[];
}

export function buildPreview(dest: DestId, lists: NormList[]): Preview {
  const rows = new Map<FieldKey, PreviewRow>(
    FIELDS.map((f) => [f, { field: f, label: FIELD_LABELS[f], total: 0, kept: 0, transformed: 0, lost: 0, variants: {} }]),
  );
  const flags: TaskFlag[] = [];
  let taskCount = 0;
  for (const list of lists) {
    for (const t of list.tasks) {
      taskCount++;
      const items: TaskFlag["items"] = [];
      for (const f of FIELDS) {
        if (!hasField(t, f)) continue;
        const info = fieldFate(dest, f, t);
        const row = rows.get(f) as PreviewRow;
        row.total++;
        row[info.fate]++;
        if (info.fate !== "kept") {
          row.variants[info.note] = (row.variants[info.note] ?? 0) + 1;
          items.push({ field: f, fate: info.fate, note: info.note });
        }
      }
      if (items.length) flags.push({ sourceId: t.sourceId, title: t.title, list: list.name, items });
    }
  }
  return { dest, taskCount, listCount: lists.length, rows: [...rows.values()].filter((r) => r.total > 0), flags, warnings: warningsFor(dest, lists) };
}

// Third-party-sourced Todoist free-plan figures, NOT from Todoist's API docs (see docs/api-notes.md). UNVERIFIED.
export const TODOIST_FREE_PROJECTS = 5;
export const TODOIST_FREE_ACTIVE_TASKS = 300;

function warningsFor(dest: DestId, lists: NormList[]): string[] {
  const out: string[] = [];
  if (dest === "todoist") {
    if (lists.length > TODOIST_FREE_PROJECTS) {
      out.push(`You have ${lists.length} lists. Todoist's free plan is reported to allow ${TODOIST_FREE_PROJECTS} projects (a third-party figure, not confirmed by Todoist's docs), so some lists may fail to create.`);
    }
    for (const l of lists) {
      const active = l.tasks.filter((t) => !t.completed).reduce((n, t) => n + 1 + t.steps.filter((s) => !s.checked).length, 0);
      if (active > TODOIST_FREE_ACTIVE_TASKS) {
        out.push(`"${l.name}" would hold about ${active} active tasks. Todoist's free plan is reported to allow ${TODOIST_FREE_ACTIVE_TASKS} per project (third-party figure, unconfirmed).`);
      }
    }
  }
  const unknown = lists.reduce((n, l) => n + l.tasks.filter((t) => t.linkedResourcesUnknown).length, 0);
  if (unknown) out.push(`Linked items could not be read for ${unknown} task${unknown === 1 ? "" : "s"}, so the "Linked items" count leaves them out.`);
  return out;
}
