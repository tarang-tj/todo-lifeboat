// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ReauthRequiredError } from "../src/errors";

vi.mock("../src/adapters/graph", () => ({
  signIn: vi.fn(async () => "acct"),
  loadAll: vi.fn(async () => { throw new ReauthRequiredError(); }),
  signOut: vi.fn(async () => undefined),
  accountName: () => "me@example.com",
}));

describe("M3: expired Microsoft token", () => {
  it("offers a Re-authorize button instead of opening a popup outside a click", async () => {
    const { startApp } = await import("../src/ui/app");
    const root = document.createElement("div");
    document.body.append(root);
    startApp(root, { msClientId: "m", googleClientId: "" }, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } as unknown as Storage);
    root.querySelector("button")!.click();
    await vi.waitFor(() => expect(root.querySelector("button")?.textContent).toBe("Re-authorize"));
    expect(root.textContent).toContain("sign in again");
  });
});
