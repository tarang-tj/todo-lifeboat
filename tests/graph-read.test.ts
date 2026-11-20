import { describe, expect, it } from "vitest";
import { createGraphReader, type GetPage } from "../src/adapters/graph-read";
import { HttpError } from "../src/adapters/http";
import { mapTask } from "../src/mapper";
import { buildPreview } from "../src/preview";
import { normalizeDue, wallToUtcMs } from "../src/tz";
import { sampleLists } from "./helpers";

const L = (id: string) => ({ id, displayName: id });
function server(opts: { expandStatus?: number; linkedFails?: boolean } = {}) {
  const urls: string[] = [];
  const get: GetPage = async <T,>(url: string) => {
    urls.push(url);
    const page = (value: unknown[], next?: string) => ({ value: value as T[], ...(next ? { "@odata.nextLink": next } : {}) });
    if (url.endsWith("/todo/lists")) return page([L("A"), L("B")]);
    if (url.includes("$expand=") && opts.expandStatus) throw new HttpError(opts.expandStatus, url, "");
    if (url.includes("$expand=")) return page([{ id: "x", title: "t", checklistItems: [], linkedResources: [] }]);
    if (url.endsWith("/tasks")) return page([{ id: "t1", title: "one" }, { id: "t2", title: "two" }]);
    if (url.endsWith("/t1/checklistItems") || url.endsWith("/t2/checklistItems")) return page([{ displayName: "s" }]);
    if (url.endsWith("/t1/linkedResources")) return page([{ id: "r1" }], "https://graph.microsoft.com/v1.0/next-linked");
    if (url.endsWith("next-linked")) return page([{ id: "r2" }]);
    if (url.endsWith("/t2/linkedResources")) { if (opts.linkedFails) throw new HttpError(404, url, ""); return page([]); }
    throw new Error(`unexpected ${url}`);
  };
  return { urls, get };
}

describe("H5: $expand fallback", () => {
  it.each([400, 501])("falls back on %i and does not try $expand for later lists", async (status) => {
    const s = server({ expandStatus: status });
    const lists = await createGraphReader(s.get).loadAll(() => undefined);
    expect(lists).toHaveLength(2);
    expect(lists[0]?.tasks[0]?.steps).toHaveLength(1);
    expect(s.urls.filter((u) => u.includes("$expand="))).toHaveLength(1); // only the first list probed
  });
  it("does not fall back on other errors", async () => {
    await expect(createGraphReader(server({ expandStatus: 403 }).get).loadAll(() => undefined)).rejects.toMatchObject({ status: 403 });
  });
  it("uses $expand for every list when it works", async () => {
    const s = server();
    await createGraphReader(s.get).loadAll(() => undefined);
    expect(s.urls.filter((u) => u.includes("$expand="))).toHaveLength(2);
  });
});

describe("H6: fallback pages linkedResources", () => {
  it("follows nextLink for linked resources", async () => {
    const lists = await createGraphReader(server({ expandStatus: 400 }).get).loadAll(() => undefined);
    expect(lists[0]?.tasks.find((t) => t.sourceId === "t1")?.linkedResourceCount).toBe(2);
  });
  it("marks the count unknown when the call fails, and the preview says so", async () => {
    const lists = await createGraphReader(server({ expandStatus: 400, linkedFails: true }).get).loadAll(() => undefined);
    const t2 = lists[0]!.tasks.find((t) => t.sourceId === "t2")!;
    expect(t2.linkedResourcesUnknown).toBe(true);
    expect(buildPreview("json", lists).warnings.join()).toMatch(/Linked items could not be read for 2 tasks/);
  });
});

describe("H7: time zones and the UTC-midnight shift", () => {
  const due = (dateTime: string, timeZone: string) => ({ id: "x", dueDateTime: { dateTime, timeZone } });
  it("UTC midnight stays the same date", () => {
    expect(mapTask(due("2026-12-01T00:00:00.0000000", "UTC"), "L").dueDateTime).toBe("2026-12-01T00:00:00.0000000");
  });
  it("UTC midnight read back in Los Angeles (previous evening) is restored to the intended date", () => {
    expect(mapTask(due("2026-11-30T16:00:00.0000000", "America/Los_Angeles"), "L").dueDateTime).toBe("2026-12-01T00:00:00.0000000");
  });
  it("restores the date east of UTC too", () => {
    expect(normalizeDue({ dateTime: "2026-12-01T09:00:00.0000000", timeZone: "Asia/Tokyo" })).toBe("2026-12-01T00:00:00.0000000");
  });
  it("a genuinely timed due date keeps its wall-clock time", () => {
    expect(normalizeDue({ dateTime: "2026-12-01T09:30:00.0000000", timeZone: "America/Los_Angeles" })).toBe("2026-12-01T09:30:00.0000000");
  });
  it("keeps an unresolvable zone name as given instead of throwing", () => {
    expect(normalizeDue({ dateTime: "2026-12-01T09:30:00.0000000", timeZone: "Pacific Standard Time" })).toBe("2026-12-01T09:30:00.0000000");
  });
  it("converts wall time to UTC with daylight saving", () => {
    expect(new Date(wallToUtcMs("2026-07-01T17:00:00", "America/Los_Angeles")).toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });
  it("sample account still previews", () => expect(buildPreview("todoist", sampleLists()).taskCount).toBe(5));
});
