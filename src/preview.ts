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
  return { dest, taskCount, listCount: lists.length, rows: [...rows.values()].filter((r) => r.total > 0), flags };
}
