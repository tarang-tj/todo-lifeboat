import { describe, expect, it, vi } from "vitest";
import type { ReadBack, WriteAdapter } from "../src/adapters/adapter";
import { buildFileReceipt, buildReceipt, countWork, newMoveState, runMove } from "../src/move";
import { parseExport } from "../src/export-parse";
import { exportFile } from "../src/exporters";
import { buildPreview } from "../src/preview";
import type { NormTask, Snapshot } from "../src/model";
import { expectedSnapshot } from "../src/snapshot";
import { sampleLists } from "./helpers";

/** In-memory destination that stores snapshots, with optional injected failures. */
function fakeAdapter(failTitles: string[] = []) {
  const store = new Map<string, Snapshot>();
  const created: string[] = [];
  let n = 0;
  const adapter: WriteAdapter = {
    id: "todoist",
    warnings: [],
    async createList() { return `P${++n}`; },
    async createTask(_l: string, t: NormTask) {
      if (failTitles.includes(t.title)) throw new Error("boom");
      const id = `D${++n}`;
      created.push(t.title);
      store.set(id, { ...expectedSnapshot("todoist", t), stepCount: 0 });
      return id;
    },
    async createStep(_l, parent) {
      const p = store.get(parent);
      if (p) p.stepCount = (p.stepCount ?? 0) + 1;
      return `S${++n}`;
    },
    async readBack(): Promise<ReadBack> { return { tasks: store, listCounts: new Map() }; },
  };
  return { adapter, store, created };
}

describe("runMove + buildReceipt", () => {
  it("moves everything and the receipt is clean", async () => {
    const lists = sampleLists();
    lists[0]!.tasks[0]!.steps = [{ title: "s1", checked: false }];
    const { adapter } = fakeAdapter();
    const progress = vi.fn();
    const state = await runMove(adapter, lists, newMoveState(), progress);
    expect(state.errors).toEqual([]);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ done: countWork(lists), total: countWork(lists) }));
    const receipt = await buildReceipt(adapter, lists, state);
    expect(receipt).toMatchObject({ total: 5, arrived: 5, exact: 5, missing: [], failed: [] });
  });

  it("collects per-task errors, skips its steps loudly, and reports failed in the receipt", async () => {
    const lists = sampleLists();
    lists[0]!.tasks[0]!.steps = [{ title: "s1", checked: false }];
    const { adapter } = fakeAdapter([lists[0]!.tasks[0]!.title]);
    const state = await runMove(adapter, lists, newMoveState(), () => undefined);
    expect(state.errors.map((e) => e.stage)).toEqual(["task", "step"]);
    expect(state.errors[1]?.message).toMatch(/parent task failed/);
    const receipt = await buildReceipt(adapter, lists, state);
    expect(receipt.failed).toHaveLength(1);
    expect(receipt.arrived).toBe(4);
  });

  it("retry skips what already moved and creates only the failed task", async () => {
    const lists = sampleLists();
    const title = lists[0]!.tasks[1]!.title;
    const first = fakeAdapter([title]);
    const state = await runMove(first.adapter, lists, newMoveState(), () => undefined);
    expect(state.errors).toHaveLength(1);
    const second = fakeAdapter();
    const again = await runMove(second.adapter, lists, state, () => undefined);
    expect(again.errors).toEqual([]);
    expect(second.created).toEqual([title]);
    expect(again.skippedAlreadyMoved).toBe(2 + 4 + 2); // 2 lists + 4 tasks + 2 steps already moved
  });

  it("a failed list is an error, and its tasks are reported, not dropped", async () => {
    const { adapter } = fakeAdapter();
    adapter.createList = async () => { throw new Error("project limit"); };
    const state = await runMove(adapter, sampleLists(), newMoveState(), () => undefined);
    expect(state.errors.filter((e) => e.stage === "list")).toHaveLength(2);
    expect(state.errors.filter((e) => e.stage === "task")).toHaveLength(5);
  });

  it("receipt flags a task whose destination value differs", async () => {
    const lists = sampleLists();
    const { adapter, store } = fakeAdapter();
    const state = await runMove(adapter, lists, newMoveState(), () => undefined);
    const rentId = state.taskMap.get("T2")!;
    store.set(rentId, { ...store.get(rentId)!, priority: 1 }); // wrong priority direction
    const receipt = await buildReceipt(adapter, lists, state);
    expect(receipt.mismatches).toEqual([expect.objectContaining({ sourceId: "T2", field: "priority", expected: "4", actual: "1" })]);
  });
});

describe("fixture end to end: map, preview, export, reconcile", () => {
  it.each(["csv", "markdown", "json"] as const)("%s", (dest) => {
    const lists = sampleLists();
    const preview = buildPreview(dest, lists);
    expect(preview.taskCount).toBe(5);
    const file = exportFile(dest, lists);
    const receipt = buildFileReceipt(parseExport(dest, file.content), dest, lists);
    expect(receipt).toMatchObject({ total: 5, arrived: 5, exact: 5, missing: [], mismatches: [] });
  });

  it("a tampered file fails reconciliation", () => {
    const lists = sampleLists();
    const content = exportFile("json", lists).content.replace('"Pay rent"', '"Pay rental"');
    const receipt = buildFileReceipt(parseExport("json", content), "json", lists);
    expect(receipt.mismatches).toEqual([expect.objectContaining({ sourceId: "T2", field: "title" })]);
  });
});
