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
    const { signIn } = await import("../src/adapters/graph");
    expect(signIn).toHaveBeenLastCalledWith("m", "personal");
    // Re-authorize reuses the kind of account the person chose.
    root.querySelector("button")!.click();
    await vi.waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    expect(signIn).toHaveBeenLastCalledWith("m", "personal");
  });

  it("signs work or school accounts in through the work button", async () => {
    const { startApp } = await import("../src/ui/app");
    const { signIn } = await import("../src/adapters/graph");
    const root = document.createElement("div");
    document.body.append(root);
    startApp(root, { msClientId: "m", googleClientId: "" }, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } as unknown as Storage);
    root.querySelectorAll("button")[1]!.click();
    await vi.waitFor(() => expect(signIn).toHaveBeenLastCalledWith("m", "work"));
  });
});
