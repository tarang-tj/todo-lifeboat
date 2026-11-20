import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../src/csv";
import { parseExport } from "../src/export-parse";
import { CSV_HEADER, exportFile } from "../src/exporters";
import { sampleLists } from "./helpers";

describe("csv helpers", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [["a", 'he said "hi", ok', "line1\nline2"], ["", "x", "y"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow(/quoted/);
  });
});

describe("exporters", () => {
  const lists = sampleLists();

  it("CSV has the header, one row per task, and neutralises formulas", () => {
    const f = exportFile("csv", lists);
    expect(f.filename).toBe("todo-export.csv");
    const rows = parseCsv(f.content);
    expect(rows[0]).toEqual(CSV_HEADER);
    expect(rows).toHaveLength(6);
    const formula = rows.find((r) => r[0] === "T4");
    expect(formula?.[2]).toBe("'=SUM(1,1) spreadsheet");
    expect(formula?.[8]).toBe("Hello & welcome"); // html flattened
    expect(formula?.[7]).toBe("Repeats every 3 months on day 15");
  });

  it("Markdown writes checkboxes, steps, metadata and ids", () => {
    const md = exportFile("markdown", lists).content;
    expect(md).toContain("## Home, \"errands\" <!-- list:L2 -->");
    expect(md).toContain("- [x] Water plants <!-- id:T3 -->");
    expect(md).toContain("  - [ ] Create draft");
    expect(md).toContain("  - due: 2026-12-01");
    expect(md).toContain("  - importance: high");
    expect(md).toContain("  > Line two");
  });

  it("JSON keeps the structured model", () => {
    const doc = JSON.parse(exportFile("json", lists).content);
    expect(doc.format).toBe("todo-lifeboat/1");
    expect(doc.lists[0].tasks[1].recurrence.type).toBe("absoluteMonthly");
  });

  it.each(["csv", "markdown", "json"] as const)("%s re-parses to the same snapshots", (dest) => {
    const parsed = parseExport(dest, exportFile(dest, lists).content);
    expect(parsed.size).toBe(5);
    expect(parsed.get("T2")).toMatchObject({ completed: false, dueDate: "2026-12-01", importance: "high", stepCount: 0 });
    expect(parsed.get("T3")?.completed).toBe(true);
    expect(parsed.get(lists[0]!.tasks[0]!.sourceId)?.stepCount).toBe(2); // doc checklist example
  });

  it("CSV and Markdown agree on step counts", () => {
    const withSteps = sampleLists();
    withSteps[0]!.tasks[0]!.steps = [{ title: "a", checked: true }, { title: "b\nc", checked: false }];
    const id = withSteps[0]!.tasks[0]!.sourceId;
    expect(parseExport("csv", exportFile("csv", withSteps).content).get(id)?.stepCount).toBe(2);
    expect(parseExport("markdown", exportFile("markdown", withSteps).content).get(id)?.stepCount).toBe(2);
  });

  it("rejects a CSV with the wrong header and a ragged row", () => {
    expect(() => parseExport("csv", "a,b\r\n1,2\r\n")).toThrow(/header/);
    expect(() => parseExport("csv", CSV_HEADER.join(",") + "\r\n1,2\r\n")).toThrow(/cells/);
  });
  it("rejects invalid JSON", () => {
    expect(() => parseExport("json", "{nope")).toThrow();
  });
});
