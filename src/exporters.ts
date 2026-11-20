import { toCsv } from "./csv";
import { datePart } from "./dates";
import { plainBody } from "./destination-text";
import type { DestId, NormList, NormTask } from "./model";
import { recurrenceToText } from "./recurrence";

export interface ExportFile {
  filename: string;
  mime: string;
  content: string;
}

export const CSV_HEADER = [
  "source_id", "list", "title", "completed", "importance", "due", "reminder", "repeat",
  "notes", "steps", "categories", "created", "has_attachments", "linked_items",
];

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, " ").trim();

function csvRow(list: NormList, t: NormTask): string[] {
  return [
    t.sourceId, list.name, t.title, String(t.completed), t.importance,
    t.dueDateTime ?? "", t.isReminderOn ? (t.reminderDateTime ?? "") : "",
    t.recurrence ? recurrenceToText(t.recurrence) : "",
    plainBody(t), t.steps.map((s) => `[${s.checked ? "x" : " "}] ${oneLine(s.title)}`).join("\n"),
    t.categories.join("; "), t.createdDateTime ?? "", String(t.hasAttachments), String(t.linkedResourceCount),
  ];
}

export function toCsvFile(lists: NormList[]): ExportFile {
  const rows = [CSV_HEADER, ...lists.flatMap((l) => l.tasks.map((t) => csvRow(l, t)))];
  return { filename: "todo-export.csv", mime: "text/csv", content: toCsv(rows) };
}

export function toJsonFile(lists: NormList[]): ExportFile {
  const doc = { format: "todo-lifeboat/1", source: "Microsoft To Do via Microsoft Graph", lists };
  return { filename: "todo-export.json", mime: "application/json", content: JSON.stringify(doc, null, 2) };
}

export function toMarkdownFile(lists: NormList[]): ExportFile {
  const out: string[] = ["# Microsoft To Do export", ""];
  for (const list of lists) {
    out.push(`## ${oneLine(list.name)} <!-- list:${list.sourceId} -->`, "");
    for (const t of list.tasks) {
      out.push(`- [${t.completed ? "x" : " "}] ${oneLine(t.title)} <!-- id:${t.sourceId} -->`);
      if (t.importance !== "normal") out.push(`  - importance: ${t.importance}`);
      const due = datePart(t.dueDateTime);
      if (due) out.push(`  - due: ${due}`);
      if (t.isReminderOn && t.reminderDateTime) out.push(`  - reminder: ${t.reminderDateTime}`);
      if (t.recurrence) out.push(`  - repeat: ${recurrenceToText(t.recurrence)}`);
      if (t.categories.length) out.push(`  - categories: ${t.categories.map(oneLine).join(", ")}`);
      if (t.hasAttachments) out.push("  - has attachments (not included)");
      if (t.linkedResourceCount) out.push(`  - linked items: ${t.linkedResourceCount} (not included)`);
      for (const s of t.steps) out.push(`  - [${s.checked ? "x" : " "}] ${oneLine(s.title)}`);
      for (const line of plainBody(t).split("\n").filter((x) => x.trim())) out.push(`  > ${line}`);
    }
    out.push("");
  }
  return { filename: "todo-export.md", mime: "text/markdown", content: out.join("\n") };
}

export function exportFile(dest: Extract<DestId, "csv" | "markdown" | "json">, lists: NormList[]): ExportFile {
  if (dest === "csv") return toCsvFile(lists);
  if (dest === "json") return toJsonFile(lists);
  return toMarkdownFile(lists);
}
