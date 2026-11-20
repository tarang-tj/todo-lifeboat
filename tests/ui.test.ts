// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { previewView, receiptView } from "../src/ui/views";
import { buildPreview } from "../src/preview";
import { startApp } from "../src/ui/app";
import { h } from "../src/ui/dom";
import { sampleLists } from "./helpers";

describe("UI smoke", () => {
  it("shows the setup message and no sign-in button when the Microsoft client ID is missing", () => {
    const root = document.createElement("div");
    startApp(root, { msClientId: "", googleClientId: "" });
    expect(root.textContent).toContain("Microsoft sign-in is not set up");
    expect(root.textContent).toContain("VITE_MS_CLIENT_ID");
    expect(root.querySelector("button")).toBeNull();
    expect(root.textContent).toContain("nothing is stored on a server");
    expect(root.textContent).toContain("not affiliated with Microsoft");
  });

  it("offers separate personal and work or school sign-in when configured", () => {
    const root = document.createElement("div");
    startApp(root, { msClientId: "abc", googleClientId: "" });
    const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Personal account (Outlook.com, Hotmail, Live)", "Work or school account"]);
  });

  it("renders task text as text, never as markup", () => {
    const el = h("p", {}, "<img src=x onerror=alert(1)>");
    expect(el.querySelector("img")).toBeNull();
    const lists = sampleLists();
    lists[0]!.tasks[1]!.title = "<b>bold</b>";
    const view = previewView(buildPreview("googleTasks", lists));
    expect(view.querySelector("b")).toBeNull();
    expect(view.textContent).toContain("<b>bold</b>");
  });

  it("renders a receipt summary", () => {
    const view = receiptView({ total: 5, arrived: 4, exact: 3, failed: [], missing: [{ sourceId: "a", title: "Lost one" }], mismatches: [], listCountDiffs: [] }, "Todoist");
    expect(view.textContent).toContain("4 of 5 tasks arrived in Todoist");
    expect(view.textContent).toContain("Lost one");
  });
});
