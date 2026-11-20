import { describe, expect, it } from "vitest";
import { mapList, mapTask } from "../src/mapper";
import { docChecklist, docList, docTask, rec } from "./fixtures";

describe("mapTask", () => {
  it("maps the Graph doc example task", () => {
    const t = mapTask({ ...docTask, checklistItems: docChecklist }, docList.id);
    expect(t).toMatchObject({
      sourceId: "AQMkADAwATM0MDAAMS0yMDkyLWVjMzYtMDACLTAwCgBGAAAD", listId: docList.id,
      title: "Linked entity new task 1", status: "notStarted", completed: false, importance: "low",
      isReminderOn: false, body: "", categories: ["Important", "Urgent"], linkedResourceCount: 1, hasAttachments: false,
      createdDateTime: "2020-07-08T11:15:19.9359889Z", dueDateTime: null, recurrence: null,
    });
    expect(t.steps).toEqual([{ title: "Create draft", checked: false }, { title: "Review with the team", checked: false }]);
  });

  it("maps completed status, due date and recurrence", () => {
    const t = mapTask({ id: "x", title: "T", status: "completed", importance: "high",
      dueDateTime: { dateTime: "2026-12-01T00:00:00.0000000", timeZone: "UTC" }, recurrence: rec.biweeklyMonWed }, "L");
    expect(t.completed).toBe(true);
    expect(t.importance).toBe("high");
    expect(t.dueDateTime).toBe("2026-12-01T00:00:00.0000000");
    expect(t.recurrence).toMatchObject({ type: "weekly", interval: 2, daysOfWeek: ["wednesday", "monday"], rangeType: "noEnd" });
  });

  it("is defensive about missing or unknown values", () => {
    const t = mapTask({ id: "y", title: "  ", status: "somethingNew", importance: "weird", recurrence: { pattern: { type: "nope" } } }, "L");
    expect(t).toMatchObject({ title: "(untitled)", status: "notStarted", importance: "normal", recurrence: null, steps: [], categories: [] });
  });

  it("reads numbered and end-date ranges", () => {
    expect(mapTask({ id: "a", recurrence: rec.tenTimes }, "L").recurrence).toMatchObject({ rangeType: "numbered", numberOfOccurrences: 10 });
    expect(mapTask({ id: "b", recurrence: rec.dailyUntil }, "L").recurrence).toMatchObject({ rangeType: "endDate", endDate: "2026-12-31" });
  });
});

describe("mapList", () => {
  it("keeps list identity and attaches tasks", () => {
    const l = mapList(docList, [docTask]);
    expect(l).toMatchObject({ sourceId: docList.id, name: "Tasks", wellknown: "defaultList" });
    expect(l.tasks).toHaveLength(1);
    expect(l.tasks[0]?.listId).toBe(docList.id);
  });
});
