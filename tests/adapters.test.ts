import { describe, expect, it } from "vitest";
import { createGoogleAdapter } from "../src/adapters/google";
import { HttpClient, HttpError } from "../src/adapters/http";
import { pageAll } from "../src/adapters/paging";
import { createTodoistAdapter } from "../src/adapters/todoist";
import type { GraphPage } from "../src/graph-types";
import { allTasks, sampleLists } from "./helpers";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined; auth: string | null };

/** Scripted fetch: each handler gets the call and returns [status, json, headers?]. */
function scripted(handler: (c: Call, i: number) => [number, unknown, Record<string, string>?]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const call: Call = {
      url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined,
      auth: new Headers(init?.headers).get("Authorization"),
    };
    calls.push(call);
    const [status, json, headers] = handler(call, calls.length - 1);
    return new Response(status === 204 ? null : JSON.stringify(json), { status, headers });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const noSleep = async () => undefined;

describe("pageAll", () => {
  it("follows @odata.nextLink with the whole URL until absent", async () => {
    const pages: Record<string, GraphPage<number>> = {
      "https://g/x": { value: [1, 2], "@odata.nextLink": "https://g/x?$skiptoken=AAA" },
      "https://g/x?$skiptoken=AAA": { value: [], "@odata.nextLink": "https://g/x?$skiptoken=BBB" }, // an empty page mid-stream
      "https://g/x?$skiptoken=BBB": { value: [3] },
    };
    const seen: string[] = [];
    const out = await pageAll<number>("https://g/x", async (u) => { seen.push(u); return pages[u] as GraphPage<number>; });
    expect(out).toEqual([1, 2, 3]);
    expect(seen).toEqual(Object.keys(pages));
  });
  it("stops a looping server", async () => {
    await expect(pageAll("https://g/x", async () => ({ value: [], "@odata.nextLink": "https://g/x" }), 5)).rejects.toThrow(/loop/);
  });
});

describe("HttpClient", () => {
  it("retries 429 honouring Retry-After, then succeeds", async () => {
    const waits: number[] = [];
    const { fetchImpl, calls } = scripted((_c, i) => (i === 0 ? [429, {}, { "Retry-After": "2" }] : [200, { ok: true }]));
    const c = new HttpClient({ minIntervalMs: 0, fetchImpl, sleep: async (ms) => { waits.push(ms); } }, async () => ({}));
    expect(await c.json("https://x")).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(waits).toContain(2000);
  });
  it("does not retry a 400 and exposes the status", async () => {
    const { fetchImpl, calls } = scripted(() => [400, { error: "bad" }]);
    const c = new HttpClient({ minIntervalMs: 0, fetchImpl, sleep: noSleep }, async () => ({}));
    await expect(c.json("https://x")).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });
  it("gives up after the retry budget", async () => {
    const { fetchImpl, calls } = scripted(() => [503, {}]);
    const c = new HttpClient({ minIntervalMs: 0, maxRetries: 2, fetchImpl, sleep: noSleep }, async () => ({}));
    await expect(c.json("https://x")).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(3);
  });
});

describe("Todoist adapter", () => {
  const t = (title: string) => allTasks(sampleLists()).find((x) => x.title === title)!;

  it("creates a project, a task with priority and due_string, and sends the bearer token", async () => {
    const { fetchImpl, calls } = scripted((c) => [200, { id: c.url.endsWith("/projects") ? "P1" : "K1" }]);
    const a = createTodoistAdapter("tok", fetchImpl);
    expect(await a.createList({ sourceId: "L", name: "Home", wellknown: "none", tasks: [] })).toBe("P1");
    await a.createTask("P1", t("Pay rent"));
    expect(calls[0]).toMatchObject({ url: "https://api.todoist.com/api/v1/projects", method: "POST", body: { name: "Home" }, auth: "Bearer tok" });
    expect(calls[1]?.url).toBe("https://api.todoist.com/api/v1/tasks");
    expect(calls[1]?.body).toMatchObject({ content: "Pay rent", project_id: "P1", priority: 4, due_string: "every 15th", description: "Line one\nLine two" });
    expect(calls[1]?.body).not.toHaveProperty("due_date"); // one due field only
  });

  it("closes completed tasks and checked steps; steps use parent_id", async () => {
    const { fetchImpl, calls } = scripted((c) => [c.url.endsWith("/close") ? 204 : 200, { id: "N" + calls.length }]);
    const a = createTodoistAdapter("tok", fetchImpl);
    await a.createTask("P1", t("Water plants"));
    await a.createStep("P1", "N1", { title: "done step", checked: true });
    expect(calls.map((c) => `${c.method} ${c.url.replace("https://api.todoist.com/api/v1", "")}`)).toEqual([
      "POST /tasks", "POST /tasks/N1/close", "POST /tasks", "POST /tasks/N3/close",
    ]);
    expect(calls[2]?.body).toMatchObject({ content: "done step", parent_id: "N1" });
    expect(calls[0]?.body).toMatchObject({ labels: ["Home"] });
  });

  it("retries once without labels on a 4xx, records a warning", async () => {
    const { fetchImpl, calls } = scripted((c) => (c.body && "labels" in c.body ? [400, { error: "labels" }] : [200, { id: "X" }]));
    const a = createTodoistAdapter("tok", fetchImpl);
    await a.createTask("P1", t("Water plants")).catch(() => undefined);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const retry = calls.filter((c) => c.body).at(-1)?.body;
    expect(retry).not.toHaveProperty("labels");
    expect(retry?.description).toContain("Labels: Home");
    expect(a.warnings).toHaveLength(1);
  });

  it("reads back with cursor paging and counts subtasks", async () => {
    const { fetchImpl } = scripted((c) => {
      if (c.url.includes("cursor=C2")) return [200, { results: [{ id: "b", content: "Sub", parent_id: "a", priority: 1, due: null }], next_cursor: null }];
      return [200, { results: [{ id: "a", content: "Top", parent_id: null, priority: 4, due: { date: "2026-12-01", is_recurring: false } }], next_cursor: "C2" }];
    });
    const got = await createTodoistAdapter("tok", fetchImpl).readBack(["P1"], []);
    expect(got.get("a")).toMatchObject({ title: "Top", priority: 4, dueDate: "2026-12-01", stepCount: 1, recurring: false });
  });

  it("treats a 404 for a completed task as missing", async () => {
    const { fetchImpl } = scripted(() => [404, {}]);
    const got = await createTodoistAdapter("tok", fetchImpl).readBack([], ["gone"]);
    expect(got.has("gone")).toBe(false);
  });
});

describe("Google Tasks adapter", () => {
  it("inserts a task with date-only due and notes, and a subtask with ?parent=", async () => {
    const lists = sampleLists();
    const rent = allTasks(lists).find((x) => x.title === "Pay rent")!;
    const { fetchImpl, calls } = scripted(() => [200, { id: "G" + 1 }]);
    const a = createGoogleAdapter("gtok", fetchImpl);
    await a.createTask("LST", rent);
    await a.createStep("LST", "G1", { title: "sub", checked: true });
    expect(calls[0]).toMatchObject({ url: "https://tasks.googleapis.com/tasks/v1/lists/LST/tasks", auth: "Bearer gtok" });
    expect(calls[0]?.body).toMatchObject({ title: "Pay rent", status: "needsAction", due: "2026-12-01T00:00:00.000Z" });
    expect(String(calls[0]?.body?.notes)).toContain("Repeats every month on day 15");
    expect(calls[0]?.body).not.toHaveProperty("reminder");
    expect(calls[1]?.url).toBe("https://tasks.googleapis.com/tasks/v1/lists/LST/tasks?parent=G1");
    expect(calls[1]?.body).toMatchObject({ title: "sub", status: "completed" });
  });

  it("reads back across pages, with completed and hidden shown, and maps parents to step counts", async () => {
    const { fetchImpl, calls } = scripted((c) => c.url.includes("pageToken=T2")
      ? [200, { items: [{ id: "k", title: "kid", parent: "p", status: "needsAction" }] }]
      : [200, { items: [{ id: "p", title: "P", status: "completed", due: "2026-12-01T00:00:00.000Z" }], nextPageToken: "T2" }]);
    const got = await createGoogleAdapter("g", fetchImpl).readBack(["LST"], []);
    expect(calls[0]?.url).toContain("showCompleted=true");
    expect(calls[0]?.url).toContain("showHidden=true");
    expect(got.get("p")).toEqual({ title: "P", completed: true, dueDate: "2026-12-01", stepCount: 1 });
  });
});
