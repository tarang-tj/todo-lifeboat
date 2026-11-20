import { describe, expect, it } from "vitest";
import { createGoogleAdapter } from "../src/adapters/google";
import { AmbiguousWriteError, HttpClient, MAX_BACKOFF_MS, RateLimitExhaustedError } from "../src/adapters/http";
import { createTodoistAdapter } from "../src/adapters/todoist";
import { noSleep, oneTask, scripted } from "./helpers";

const client = (fetchImpl: typeof fetch, sleep: (ms: number) => Promise<void> = noSleep, maxRetries?: number) =>
  new HttpClient({ minIntervalMs: 0, fetchImpl, sleep, maxRetries }, async () => ({}));

describe("C2: non-idempotent writes are not blindly retried", () => {
  it("a POST that gets a 503 is not repeated and surfaces as ambiguous", async () => {
    const { fetchImpl, calls } = scripted(() => [503, {}]);
    await expect(client(fetchImpl).json("https://x", { method: "POST", body: {} })).rejects.toBeInstanceOf(AmbiguousWriteError);
    expect(calls).toHaveLength(1);
  });
  it("a POST network error is not repeated", async () => {
    let n = 0;
    const fetchImpl = (async () => { n++; throw new TypeError("offline"); }) as unknown as typeof fetch;
    await expect(client(fetchImpl).json("https://x", { method: "POST", body: {} })).rejects.toMatchObject({ status: 0 });
    expect(n).toBe(1);
  });
  it("a POST that gets 429 is retried, because the server did not process it", async () => {
    const { fetchImpl, calls } = scripted((_c, i) => (i === 0 ? [429, {}, { "Retry-After": "1" }] : [200, { ok: 1 }]));
    expect(await client(fetchImpl).json("https://x", { method: "POST", body: {} })).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });
  it("a GET still retries 5xx, except 501", async () => {
    const { fetchImpl, calls } = scripted((_c, i) => (i === 0 ? [503, {}] : [200, {}]));
    await client(fetchImpl).json("https://x");
    expect(calls).toHaveLength(2);
    const nope = scripted(() => [501, {}]);
    await expect(client(nope.fetchImpl).json("https://x")).rejects.toMatchObject({ status: 501 });
    expect(nope.calls).toHaveLength(1);
  });
});

describe("H2: rate limit backoff", () => {
  it("caps Retry-After at 60 s", async () => {
    const waits: number[] = [];
    const { fetchImpl } = scripted((_c, i) => (i === 0 ? [429, {}, { "Retry-After": "600" }] : [200, {}]));
    await client(fetchImpl, async (ms) => { waits.push(ms); }).json("https://x");
    expect(Math.max(...waits)).toBe(MAX_BACKOFF_MS);
  });
  it("throws RateLimitExhaustedError after the retry budget", async () => {
    const { fetchImpl, calls } = scripted(() => [429, {}]);
    await expect(client(fetchImpl, noSleep, 2).json("https://x")).rejects.toBeInstanceOf(RateLimitExhaustedError);
    expect(calls).toHaveLength(3);
  });
});

describe("C2: look up before re-creating", () => {
  it("Todoist reuses the item when the failed create actually succeeded", async () => {
    const { fetchImpl, calls } = scripted((c, i) => {
      if (c.method === "POST") return [503, {}];
      return [200, { results: [{ id: "EXISTING", content: "Task", parent_id: null, priority: 1, due: null }], next_cursor: null }];
    });
    const a = createTodoistAdapter("t", fetchImpl);
    expect(await a.createTask("P", oneTask())).toBe("EXISTING");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(a.warnings.join()).toContain("reused");
  });
  it("Todoist creates again only when the lookup finds nothing", async () => {
    const { fetchImpl, calls } = scripted((c, i) => {
      if (c.method === "POST") return i === 0 ? [503, {}] : [200, { id: "NEW" }];
      return [200, { results: [], next_cursor: null }];
    });
    expect(await createTodoistAdapter("t", fetchImpl).createTask("P", oneTask())).toBe("NEW");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });
  it("Google reuses by title and parent", async () => {
    const { fetchImpl, calls } = scripted((c) => (c.method === "POST" ? [500, {}] : [200, { items: [{ id: "G1", title: "Task" }] }]));
    expect(await createGoogleAdapter("t", fetchImpl).createTask("L", oneTask())).toBe("G1");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});
