// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGoogleToken } from "../src/adapters/google-auth";
import { saveState, storeKey } from "../src/move-store";
import { newMoveState } from "../src/move";
import { createDestUI, type Ctx } from "../src/ui/dest";
import { receiptView, todoistTokenInput } from "../src/ui/views";
import { oneTask } from "./helpers";

const fakeStorage = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
};
const lists = [{ sourceId: "L", name: "Home", wellknown: "none", tasks: [oneTask()] }];
function mount(over: Partial<Ctx> = {}, google = "gid") {
  const ctx: Ctx = { cfg: { msClientId: "m", googleClientId: google }, lists, accountId: "acct", storage: fakeStorage(), say: () => undefined, ...over };
  const secDest = document.createElement("section");
  const secOut = document.createElement("section");
  document.body.append(secDest, secOut);
  const ui = createDestUI(ctx, secDest, secOut);
  ui.render();
  return { ctx, secDest, secOut };
}
const pick = (root: HTMLElement, value: string) => {
  const r = root.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
  r.checked = true;
  r.dispatchEvent(new Event("change"));
};
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); delete (window as { google?: unknown }).google; });

describe("L2: Todoist token field", () => {
  it("sets the value as a property, never as an attribute, and blocks autofill", () => {
    const input = todoistTokenInput("secret-token", () => undefined);
    expect(input.value).toBe("secret-token");
    expect(input.hasAttribute("value")).toBe(false);
    expect(input.getAttribute("autocomplete")).toBe("new-password");
    expect(input.outerHTML).not.toContain("secret-token");
  });
});

describe("M7/H4: receipt cleanliness and notes", () => {
  const ok = { total: 2, arrived: 2, exact: 2, failed: [], missing: [], mismatches: [], listCountDiffs: [] };
  it("is not clean when the move had errors, even if everything read back matches", () => {
    expect(receiptView(ok, "Todoist", { errorCount: 1, warnings: [] }).textContent).toContain("Not clean");
    expect(receiptView(ok, "Todoist", { errorCount: 0, warnings: [] }).textContent).not.toContain("Not clean");
  });
  it("shows adapter warnings and list count differences", () => {
    const text = receiptView({ ...ok, listCountDiffs: [{ list: "Home", expected: 2, actual: 3 }] }, "Todoist", { errorCount: 0, warnings: ["labels rejected; kept as text"] }).textContent;
    expect(text).toContain("labels rejected; kept as text");
    expect(text).toContain("Home: expected 2, found 3");
    expect(text).toContain("Not clean");
  });
});

describe("H1: progress per destination survives switching", () => {
  it("keeps Todoist progress after visiting other destinations", () => {
    const storage = fakeStorage();
    const s = newMoveState();
    s.taskMap.set("T", "D1");
    saveState(storage, storeKey("todoist", "acct"), s);
    const { secDest } = mount({ storage });
    expect(button(secDest, "Forget saved progress (1 items)")).toBeTruthy();
    pick(secDest, "json");
    expect(button(secDest, "Forget saved progress")).toBeFalsy();
    pick(secDest, "todoist");
    expect(button(secDest, "Forget saved progress (1 items)")).toBeTruthy();
    expect(storage.getItem(storeKey("todoist", "acct"))).not.toBeNull();
  });
  it("progress saved for another account is not picked up", () => {
    const storage = fakeStorage();
    const s = newMoveState();
    s.taskMap.set("T", "D1");
    saveState(storage, storeKey("todoist", "someone-else"), s);
    expect(button(mount({ storage }).secDest, "Forget saved progress")).toBeFalsy();
  });
});

describe("M4: Google button and timeout", () => {
  it("is disabled until the Google script is loaded", async () => {
    const { secDest } = mount();
    pick(secDest, "googleTasks");
    expect(button(secDest, "Move my tasks")?.disabled).toBe(true);
    (window as { google?: unknown }).google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: () => undefined }) } } };
    pick(secDest, "todoist");
    pick(secDest, "googleTasks");
    await vi.waitFor(() => expect(button(secDest, "Move my tasks")?.disabled).toBe(false));
  });
  it("gives up waiting for the token after the timeout", async () => {
    (window as { google?: unknown }).google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: () => undefined }) } } };
    await expect(requestGoogleToken("gid", 20)).rejects.toThrow(/timed out/);
  });
});

describe("M5: move counts and errors survive a failed read-back", () => {
  it("shows the summary and a Verify again button", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const get = (init?.method ?? "GET") === "GET";
      if (get && url.includes("/projects")) return new Response(JSON.stringify({ results: [], next_cursor: null }));
      if (get) return new Response("forbidden", { status: 403 }); // the read-back
      return new Response(JSON.stringify({ id: url.endsWith("/projects") ? "P" : "D" }));
    }));
    const { secDest, secOut } = mount();
    const token = secDest.querySelector<HTMLInputElement>("#td-token")!;
    token.value = "tok";
    token.dispatchEvent(new Event("input"));
    button(secDest, "Move my tasks")!.click();
    await vi.waitFor(() => expect(secOut.textContent).toContain("Verify again"), { timeout: 8000 });
    expect(secOut.textContent).toContain("2 of 2 items written");
    expect(secOut.textContent).toContain("Read-back failed");
  }, 12000);
});
