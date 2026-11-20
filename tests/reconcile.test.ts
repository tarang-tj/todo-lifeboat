import { describe, expect, it } from "vitest";
import { reconcile } from "../src/reconcile";
import type { Snapshot } from "../src/model";

const exp = (...ids: string[]) => new Map(ids.map((id) => [id, { title: `Task ${id}`, snapshot: { title: `Task ${id}`, completed: false, dueDate: "2026-12-01", stepCount: 2 } as Snapshot }]));
const same = (id: string): [string, Snapshot] => [id, { title: `Task ${id}`, completed: false, dueDate: "2026-12-01", stepCount: 2 }];

describe("reconcile", () => {
  it("all good", () => {
    const r = reconcile({ expected: exp("a", "b"), actual: new Map([same("a"), same("b")]) });
    expect(r).toMatchObject({ total: 2, arrived: 2, exact: 2, missing: [], mismatches: [], failed: [] });
  });

  it("reports missing tasks", () => {
    const r = reconcile({ expected: exp("a", "b", "c"), actual: new Map([same("a")]) });
    expect(r.arrived).toBe(1);
    expect(r.missing.map((m) => m.sourceId)).toEqual(["b", "c"]);
  });

  it("reports field mismatches with expected and actual values", () => {
    const bad: Snapshot = { title: "Task a", completed: true, dueDate: null, stepCount: 1 };
    const r = reconcile({ expected: exp("a"), actual: new Map([["a", bad]]) });
    expect(r).toMatchObject({ arrived: 1, exact: 0 });
    expect(r.mismatches).toEqual(expect.arrayContaining([
      { sourceId: "a", title: "Task a", field: "completed", expected: "false", actual: "true" },
      { sourceId: "a", title: "Task a", field: "dueDate", expected: "2026-12-01", actual: "none" },
      { sourceId: "a", title: "Task a", field: "stepCount", expected: "2", actual: "1" },
    ]));
  });

  it("does not compare fields the destination cannot report", () => {
    const r = reconcile({ expected: exp("a"), actual: new Map([["a", { title: "Task a" }]]) });
    expect(r).toMatchObject({ arrived: 1, exact: 1, mismatches: [] });
  });

  it("separates failed writes from missing ones", () => {
    const r = reconcile({ expected: exp("a", "b"), actual: new Map([same("a")]), failed: new Set(["b"]) });
    expect(r.failed.map((f) => f.sourceId)).toEqual(["b"]);
    expect(r.missing).toEqual([]);
  });

  it("detects a changed title", () => {
    const r = reconcile({ expected: exp("a"), actual: new Map([["a", { ...same("a")[1], title: "Renamed" }]]) });
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0]).toMatchObject({ field: "title", expected: "Task a", actual: "Renamed" });
  });
});
