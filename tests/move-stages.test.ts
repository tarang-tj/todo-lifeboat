import { describe, expect, it } from "vitest";
import type { ReadBack, WriteAdapter } from "../src/adapters/adapter";
import { HttpError, RateLimitExhaustedError } from "../src/adapters/http";
import type { NormList } from "../src/model";
import { buildReceipt, newMoveState, runMove } from "../src/move";
import { loadState, saveState, storeKey } from "../src/move-store";
import { expectedSnapshot } from "../src/snapshot";
import { recurrenceToText } from "../src/recurrence";
import { taskVariants } from "../src/adapters/todoist-create";
import { mapTask } from "../src/mapper";
import { rec } from "./fixtures";
import { oneTask } from "./helpers";

const list = (tasks: ReturnType<typeof oneTask>[]): NormList => ({ sourceId: "L", name: "List", wellknown: "none", tasks });
const t = (id: string, over = {}) => oneTask({ sourceId: id, title: id, ...over });

function recorder(opts: { failClose?: string[]; failCreate?: Record<string, unknown> } = {}) {
  const log: string[] = [];
  let n = 0;
  const closeFails = new Set(opts.failClose ?? []);
  const adapter: WriteAdapter = {
    id: "todoist", warnings: [],
    async createList() { return "P"; },
    async createTask(_l, task, prev) {
      const err = opts.failCreate?.[task.title];
      if (err) throw err;
      const id = `D${++n}`; log.push(`create ${task.title}${prev ? ` after ${prev}` : ""}`); return id;
    },
    async createStep(_l, parent, s, prev) { const id = `D${++n}`; log.push(`step ${s.title} of ${parent}${prev ? ` after ${prev}` : ""}`); return id; },
    async closeTask(id) { if (closeFails.has(id)) { closeFails.delete(id); throw new Error("close failed"); } log.push(`close ${id}`); },
    async readBack(): Promise<ReadBack> { return { tasks: new Map(), listCounts: new Map() }; },
  };
  return { adapter, log };
}

describe("C3: close is its own retryable stage", () => {
  it("records the id before closing, and a retry closes without re-creating", async () => {
    const { adapter, log } = recorder({ failClose: ["D1"] });
    const lists = [list([t("A", { completed: true })])];
    const state = await runMove(adapter, lists, newMoveState(), () => undefined);
    expect(state.taskMap.get("A")).toBe("D1");
    expect(state.errors).toMatchObject([{ stage: "close", sourceId: "A" }]);
    await runMove(adapter, lists, state, () => undefined);
    expect(log.filter((l) => l.startsWith("create"))).toEqual(["create A"]);
    expect(log).toContain("close D1");
    expect(state.errors).toEqual([]);
    expect(state.closed.has("A")).toBe(true);
  });
});

describe("M1/M6: order of writes", () => {
  it("creates steps before closing a completed parent, closes only checked steps of open tasks, passes previous sibling", async () => {
    const { adapter, log } = recorder();
    const steps = [{ title: "s1", checked: true }, { title: "s2", checked: false }];
    await runMove(adapter, [list([t("A", { completed: true, steps }), t("B", { steps })])], newMoveState(), () => undefined);
    expect(log).toEqual([
      "create A", "step s1 of D1", "step s2 of D1 after D2", "close D1",
      "create B after D1", "step s1 of D4", "step s2 of D4 after D5", "close D5",
    ]);
  });
});

describe("H2: circuit breaker", () => {
  it.each([[401], [403]])("HTTP %i pauses the run and stops attempting items", async (status) => {
    const { adapter, log } = recorder({ failCreate: { B: new HttpError(status, "u", "") } });
    const state = await runMove(adapter, [list([t("A"), t("B"), t("C")])], newMoveState(), () => undefined);
    expect(state.paused).toBe("Paused. Run again to resume.");
    expect(log).toEqual(["create A"]); // C never attempted
    expect(state.errors).toHaveLength(1);
  });
  it("an exhausted 429 pauses too, and a resume continues from where it stopped", async () => {
    const { adapter } = recorder({ failCreate: { B: new RateLimitExhaustedError(429, "u", "") } });
    const lists = [list([t("A"), t("B"), t("C")])];
    const state = await runMove(adapter, lists, newMoveState(), () => undefined);
    expect(state.paused).not.toBeNull();
    const again = recorder();
    await runMove(again.adapter, lists, state, () => undefined);
    expect(state.paused).toBeNull();
    expect(again.log.filter((l) => l.startsWith("create"))).toEqual(["create B after D1", "create C after D1"]);
  });
  it("an ordinary failure does not pause", async () => {
    const { adapter } = recorder({ failCreate: { B: new HttpError(400, "u", "bad") } });
    const state = await runMove(adapter, [list([t("A"), t("B"), t("C")])], newMoveState(), () => undefined);
    expect(state.paused).toBeNull();
    expect(state.taskMap.has("C")).toBe(true);
  });
});

describe("C4: completed recurring tasks", () => {
  const done = oneTask({ completed: true, status: "completed", dueDateTime: "2026-12-07T00:00:00.0000000",
    recurrence: mapTask({ id: "x", recurrence: rec.weeklyMonday }, "L").recurrence });
  it("never sends due_string, sends due_date and keeps the rule text", () => {
    for (const v of taskVariants(done, "P")) {
      expect(v.body).not.toHaveProperty("due_string");
      expect(v.body.due_date).toBe("2026-12-07");
      expect(String(v.body.description)).toContain(recurrenceToText(done.recurrence!));
    }
  });
  it("expects recurring=false and a due date for it", () => {
    expect(expectedSnapshot("todoist", done)).toMatchObject({ recurring: false, dueDate: "2026-12-07" });
    expect(expectedSnapshot("todoist", { ...done, completed: false })).toMatchObject({ recurring: true });
  });
});

describe("C2: duplicates surface in the receipt", () => {
  it("reports a list holding more top-level tasks than expected", async () => {
    const { adapter } = recorder();
    adapter.readBack = async () => ({ tasks: new Map(), listCounts: new Map([["P", 3]]) });
    const lists = [list([t("A"), t("B")])];
    const state = await runMove(adapter, lists, newMoveState(), () => undefined);
    const receipt = await buildReceipt(adapter, lists, state);
    expect(receipt.listCountDiffs).toEqual([{ list: "List", expected: 2, actual: 3 }]);
  });
});

describe("H1: progress is persisted per destination and account", () => {
  it("round-trips maps and closed set, and keys by destination and account", () => {
    const s = newMoveState();
    s.listMap.set("L", "P"); s.taskMap.set("A", "D1"); s.closed.add("A");
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as unknown as Storage;
    saveState(storage, storeKey("todoist", "acct1"), s);
    const back = loadState(storage, storeKey("todoist", "acct1"));
    expect([...back.taskMap]).toEqual([["A", "D1"]]);
    expect(back.closed.has("A")).toBe(true);
    expect(loadState(storage, storeKey("googleTasks", "acct1")).taskMap.size).toBe(0);
    expect(loadState(storage, storeKey("todoist", "acct2")).taskMap.size).toBe(0);
    expect([...store.keys()].join()).not.toMatch(/token/i);
  });
  it("ignores corrupt saved data", () => {
    const storage = { getItem: () => "{nope", setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
    expect(loadState(storage, "k").taskMap.size).toBe(0);
  });
});
