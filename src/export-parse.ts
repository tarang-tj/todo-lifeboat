import { CSV_HEADER } from "./exporters";
import { parseCsv, unprotect } from "./csv";
import { datePart } from "./dates";
import type { DestId, Importance, Snapshot } from "./model";

const asImportance = (v: string | undefined): Importance =>
  v === "high" || v === "low" ? v : "normal";

/** Re-parse a generated file into snapshots keyed by source id. Throws on malformed input. */
export function parseExport(dest: Extract<DestId, "csv" | "markdown" | "json">, content: string): Map<string, Snapshot> {
  if (dest === "json") return parseJson(content);
  if (dest === "csv") return parseCsvExport(content);
  return parseMarkdown(content);
}

interface JsonDoc {
  lists?: { tasks?: { sourceId: string; title: string; completed: boolean; dueDateTime: string | null; importance: string; steps?: unknown[] }[] }[];
}

function parseJson(content: string): Map<string, Snapshot> {
  const doc = JSON.parse(content) as JsonDoc;
  const out = new Map<string, Snapshot>();
  for (const list of doc.lists ?? []) {
    for (const t of list.tasks ?? []) {
      out.set(t.sourceId, {
        title: t.title, completed: t.completed, dueDate: datePart(t.dueDateTime),
        stepCount: t.steps?.length ?? 0, importance: asImportance(t.importance),
      });
    }
  }
  return out;
}

function parseCsvExport(content: string): Map<string, Snapshot> {
  const rows = parseCsv(content);
  const header = rows[0] ?? [];
  if (header.join(",") !== CSV_HEADER.join(",")) throw new Error("CSV header does not match the expected columns");
  const col = (name: string): number => CSV_HEADER.indexOf(name);
  const out = new Map<string, Snapshot>();
  for (const r of rows.slice(1)) {
    if (r.length === 1 && r[0] === "") continue;
    if (r.length !== CSV_HEADER.length) throw new Error(`CSV row has ${r.length} cells, expected ${CSV_HEADER.length}`);
    const get = (n: string): string => r[col(n)] ?? "";
    const steps = get("steps").split("\n").filter((s) => s.trim() !== "");
    out.set(get("source_id"), {
      title: unprotect(get("title")), completed: get("completed") === "true",
      dueDate: datePart(get("due")), stepCount: steps.length, importance: asImportance(get("importance")),
    });
  }
  return out;
}

function parseMarkdown(content: string): Map<string, Snapshot> {
  const out = new Map<string, Snapshot>();
  let cur: Snapshot | null = null;
  for (const line of content.split("\n")) {
    const task = /^- \[( |x)\] (.*) <!-- id:(.+) -->$/.exec(line);
    if (task) {
      cur = { title: task[2] as string, completed: task[1] === "x", dueDate: null, stepCount: 0, importance: "normal" };
      out.set(task[3] as string, cur);
      continue;
    }
    if (!cur) continue;
    if (/^ {2}- \[( |x)\] /.test(line)) cur.stepCount = (cur.stepCount ?? 0) + 1;
    else if (line.startsWith("  - due: ")) cur.dueDate = line.slice(9).trim();
    else if (line.startsWith("  - importance: ")) cur.importance = asImportance(line.slice(16).trim());
  }
  return out;
}
