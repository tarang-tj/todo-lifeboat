import { describe, expect, it } from "vitest";
import { buildPreview } from "../src/preview";
import { sampleLists } from "./helpers";

const row = (p: ReturnType<typeof buildPreview>, f: string) => p.rows.find((r) => r.field === f);

describe("buildPreview on the sample account", () => {
  const lists = sampleLists(); // 5 tasks, 2 lists

  it("counts tasks and only fields that exist", () => {
    const p = buildPreview("todoist", lists);
    expect(p).toMatchObject({ taskCount: 5, listCount: 2 });
    expect(row(p, "recurrence")).toMatchObject({ total: 3, kept: 0, transformed: 3, lost: 0 });
    expect(row(p, "steps")).toMatchObject({ total: 1, transformed: 1 });
    expect(row(p, "completed")).toMatchObject({ total: 1, transformed: 1 });
    expect(p.rows.find((r) => r.field === "linkedResources")).toMatchObject({ total: 1, lost: 1 });
  });

  it("Todoist: importance high is transformed, low is lost; reminders lost", () => {
    const p = buildPreview("todoist", lists);
    expect(row(p, "importance")).toMatchObject({ total: 2, transformed: 1, lost: 1 });
    expect(row(p, "reminder")).toMatchObject({ total: 1, lost: 1 });
  });

  it("Todoist: separates expressible rules from text-only ones in the variants", () => {
    const v = row(buildPreview("todoist", lists), "recurrence")?.variants ?? {};
    expect(v["Becomes a Todoist repeat phrase"]).toBe(1); // monthly 15th
    expect(v["Task is completed; the rule is kept as text in the description"]).toBe(1); // completed biweekly
    expect(v["Not expressible; kept as text in the description, task will not repeat"]).toBe(1); // quarterly
  });

  it("Google Tasks: no importance, no reminders, date-only due, subtasks, repeat as notes text", () => {
    const p = buildPreview("googleTasks", lists);
    expect(row(p, "importance")).toMatchObject({ total: 2, lost: 2 });
    expect(row(p, "reminder")).toMatchObject({ total: 1, lost: 1 });
    expect(row(p, "recurrence")).toMatchObject({ total: 3, transformed: 3 });
    expect(row(p, "steps")).toMatchObject({ transformed: 1 });
    // T4 is due 14:30, so the time of day is dropped; T2 is date-only, so it stays kept.
    expect(row(p, "due")).toMatchObject({ total: 2, kept: 1, transformed: 1 });
    expect(row(p, "categories")).toMatchObject({ total: 2, transformed: 2 });
  });

  it("Google Tasks flags notes cut at 8192 characters", () => {
    const big = sampleLists();
    (big[0]!.tasks[0] as { body: string }).body = "x".repeat(9000);
    expect(row(buildPreview("googleTasks", big), "notes")?.variants["Notes cut to 8192 characters"]).toBe(1);
  });

  it("JSON keeps everything except counted attachments and links", () => {
    const p = buildPreview("json", lists);
    expect(p.rows.every((r) => r.lost === 0)).toBe(true);
    expect(row(p, "recurrence")).toMatchObject({ kept: 3 });
    expect(row(p, "attachments")).toMatchObject({ transformed: 1 });
  });

  it("per-task flags list non-kept outcomes", () => {
    const p = buildPreview("googleTasks", lists);
    const rent = p.flags.find((f) => f.title === "Pay rent");
    expect(rent?.items.map((i) => `${i.field}:${i.fate}`)).toEqual(
      expect.arrayContaining(["importance:lost", "reminder:lost", "recurrence:transformed", "attachments:lost"]),
    );
    expect(p.flags.find((f) => f.title === "Plain")).toBeUndefined();
  });
});
