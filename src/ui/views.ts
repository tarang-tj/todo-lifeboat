import { DEST_LABELS } from "../capabilities";
import type { NormList } from "../model";
import type { MoveError } from "../move";
import type { Preview } from "../preview";
import type { Receipt } from "../reconcile";
import { h } from "./dom";

const num = (n: number): HTMLElement => h("td", { class: "num" }, String(n));
const th = (t: string, numeric = false): HTMLElement => h("th", { scope: "col", class: numeric ? "num" : "" }, t);

export function inventoryView(lists: NormList[]): HTMLElement {
  const all = lists.flatMap((l) => l.tasks);
  const count = (f: (t: (typeof all)[number]) => boolean): number => all.filter(f).length;
  const stats: [string, number][] = [
    ["Lists", lists.length], ["Tasks", all.length], ["Completed", count((t) => t.completed)],
    ["With steps", count((t) => t.steps.length > 0)], ["Repeating", count((t) => t.recurrence !== null)],
    ["With reminders", count((t) => t.isReminderOn)], ["With attachments", count((t) => t.hasAttachments)],
  ];
  return h("div", {},
    h("div", { class: "table-wrap" }, h("table", {},
      h("caption", { class: "muted" }, "What was found in your account"),
      h("tbody", {}, ...stats.map(([k, v]) => h("tr", {}, h("th", { scope: "row" }, k), num(v)))))),
    h("details", {}, h("summary", {}, "Lists"),
      h("ul", { class: "plain" }, ...lists.map((l) => h("li", {}, `${l.name} (${l.tasks.length})`)))));
}

export function previewView(p: Preview): HTMLElement {
  const dest = DEST_LABELS[p.dest];
  if (p.rows.length === 0) return h("p", {}, `Everything in your ${p.taskCount} tasks moves to ${dest} as plain titles.`);
  const body = p.rows.map((r) => h("tr", {},
    h("th", { scope: "row" }, r.label), num(r.total), num(r.kept), num(r.transformed), num(r.lost),
    h("td", {}, ...Object.entries(r.variants).map(([n, c]) => h("div", {}, `${c}: ${n}`)))));
  const flagged = p.flags.slice(0, 100);
  return h("div", {},
    h("div", { class: "table-wrap" }, h("table", {},
      h("caption", {}, `What survives the move to ${dest} (${p.taskCount} tasks, ${p.listCount} lists)`),
      h("thead", {}, h("tr", {}, th("Field"), th("Tasks with it", true), th("Kept", true), th("Changed", true), th("Lost", true), th("What happens"))),
      h("tbody", {}, ...body))),
    p.flags.length ? h("details", {}, h("summary", {}, `Tasks with changes or losses (${p.flags.length})`),
      h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, th("Task"), th("List"), th("Flags"))),
        h("tbody", {}, ...flagged.map((f) => h("tr", {}, h("td", {}, f.title), h("td", {}, f.list),
          h("td", {}, ...f.items.map((i) => h("div", {}, `${i.fate}: ${i.note}`))))))))
      , p.flags.length > flagged.length ? h("p", { class: "muted" }, `Showing the first ${flagged.length}. The counts above cover all tasks.`) : null) : null);
}

export function errorsView(errors: MoveError[]): HTMLElement {
  return h("div", { class: "card", role: "alert" },
    h("strong", { class: "bad" }, `${errors.length} item${errors.length === 1 ? "" : "s"} failed`),
    h("ul", { class: "plain" }, ...errors.slice(0, 50).map((e) => h("li", {}, `${e.stage} "${e.title}": ${e.message}`))),
    errors.length > 50 ? h("p", { class: "muted" }, `${errors.length - 50} more not shown.`) : null);
}

export function receiptView(r: Receipt, destLabel: string): HTMLElement {
  const clean = r.missing.length === 0 && r.failed.length === 0 && r.mismatches.length === 0;
  const list = (title: string, items: string[]): HTMLElement | null =>
    items.length ? h("details", {}, h("summary", {}, `${title} (${items.length})`), h("ul", { class: "plain" }, ...items.slice(0, 100).map((i) => h("li", {}, i)))) : null;
  return h("div", { class: "card" },
    h("p", {}, h("strong", { class: clean ? "ok" : "warn" }, `${r.arrived} of ${r.total} tasks arrived in ${destLabel}`),
      ` (${r.exact} with every checked field matching).`),
    list("Missing from the destination", r.missing.map((m) => m.title)),
    list("Failed during the move", r.failed.map((m) => m.title)),
    list("Field differences", r.mismatches.map((m) => `${m.title}: ${m.field} should be ${m.expected}, found ${m.actual}`)),
    h("p", { class: "muted" }, "Fields a destination cannot report back are not compared. Anything the preview marked as changed or lost is expected."));
}
