import { describe, expect, it } from "vitest";
import { createGoogleAdapter } from "../src/adapters/google";
import { createTodoistAdapter } from "../src/adapters/todoist";
import { mapTask } from "../src/mapper";
import { buildPreview, TODOIST_FREE_ACTIVE_TASKS, TODOIST_FREE_PROJECTS } from "../src/preview";
import { rec } from "./fixtures";
import { oneTask, scripted } from "./helpers";

const recurring = () => oneTask({ title: "Gym", categories: ["Health"], dueDateTime: "2026-12-07T00:00:00.0000000",
  recurrence: mapTask({ id: "x", recurrence: rec.biweeklyMonWed }, "L").recurrence });
const emptyPage = { results: [], next_cursor: null };

describe("H4: staged Todoist fallback", () => {
  it("drops the repeat phrase first, keeps labels, and records which fallback applied", async () => {
    const { fetchImpl, calls } = scripted((c) => (c.body && "due_string" in c.body ? [400, {}] : [200, { id: "K" }]));
    const a = createTodoistAdapter("t", fetchImpl);
    expect(await a.createTask("P", recurring())).toBe("K");
    const bodies = calls.map((c) => c.body!);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ due_date: "2026-12-07", labels: ["Health"] });
    expect(bodies[1]).not.toHaveProperty("due_string");
    expect(String(bodies[1]!.description)).toContain("Repeats every 2 weeks on Monday, Wednesday");
    expect(a.warnings).toHaveLength(1);
    expect(a.warnings[0]).toContain("repeat phrase rejected");
  });
  it("then drops labels, keeping them as text", async () => {
    const { fetchImpl, calls } = scripted((c) => (c.body && ("due_string" in c.body || "labels" in c.body) ? [422, {}] : [200, { id: "K" }]));
    const a = createTodoistAdapter("t", fetchImpl);
    await a.createTask("P", recurring());
    expect(calls).toHaveLength(3);
    expect(calls[2]!.body).not.toHaveProperty("labels");
    expect(String(calls[2]!.body!.description)).toContain("Labels: Health");
    expect(a.warnings[0]).toContain("labels rejected");
  });
  it("does not work around auth or rate-limit errors", async () => {
    const { fetchImpl, calls } = scripted(() => [403, { error: "forbidden" }]);
    await expect(createTodoistAdapter("t", fetchImpl).createTask("P", recurring())).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
  });
});

describe("H1: reuse an existing project or list", () => {
  it("Todoist reuses a same-name project and warns", async () => {
    const { fetchImpl, calls } = scripted(() => [200, { results: [{ id: "OLD", name: "Home" }], next_cursor: null }]);
    const a = createTodoistAdapter("t", fetchImpl);
    expect(await a.createList({ sourceId: "L", name: "Home", wellknown: "none", tasks: [] })).toBe("OLD");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(a.warnings[0]).toContain("already exists");
  });
  it("Google reuses a same-name list and warns; a second same-name list is created fresh", async () => {
    const { fetchImpl, calls } = scripted((c) => (c.method === "GET" ? [200, { items: [{ id: "OLD", title: "Home" }] }] : [200, { id: "NEW" }]));
    const a = createGoogleAdapter("t", fetchImpl);
    const l = { sourceId: "L", name: "Home", wellknown: "none", tasks: [] };
    expect(await a.createList(l)).toBe("OLD");
    expect(await a.createList({ ...l, sourceId: "L2" })).toBe("NEW");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(a.warnings[0]).toContain("already exists");
  });
  it("Todoist creates the project when no same-name one exists", async () => {
    const { fetchImpl } = scripted((c) => (c.method === "GET" ? [200, emptyPage] : [200, { id: "P9" }]));
    expect(await createTodoistAdapter("t", fetchImpl).createList({ sourceId: "L", name: "Fresh", wellknown: "none", tasks: [] })).toBe("P9");
  });
});

describe("H3: Todoist plan limit warnings", () => {
  const mk = (n: number, tasks = 1) => Array.from({ length: n }, (_, i) => ({ sourceId: `L${i}`, name: `List ${i}`, wellknown: "none", tasks: Array.from({ length: tasks }, (_, j) => oneTask({ sourceId: `${i}-${j}` })) }));
  it("warns above the project cap, only for Todoist", () => {
    expect(buildPreview("todoist", mk(TODOIST_FREE_PROJECTS + 1)).warnings.join()).toMatch(/6 lists.*third-party/);
    expect(buildPreview("todoist", mk(TODOIST_FREE_PROJECTS)).warnings).toEqual([]);
    expect(buildPreview("googleTasks", mk(TODOIST_FREE_PROJECTS + 1)).warnings).toEqual([]);
  });
  it("warns above the active-task cap per project and ignores completed tasks", () => {
    const big = mk(1, TODOIST_FREE_ACTIVE_TASKS + 1);
    expect(buildPreview("todoist", big).warnings.join()).toContain(`${TODOIST_FREE_ACTIVE_TASKS + 1} active tasks`);
    big[0]!.tasks.forEach((t) => { t.completed = true; });
    expect(buildPreview("todoist", big).warnings).toEqual([]);
  });
});
