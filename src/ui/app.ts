import type { WriteAdapter } from "../adapters/adapter";
import { loadGoogleScript, requestGoogleToken } from "../adapters/google-auth";
import { createGoogleAdapter } from "../adapters/google";
import { loadAll, signIn } from "../adapters/graph";
import { createTodoistAdapter } from "../adapters/todoist";
import { DEST_LABELS } from "../capabilities";
import { parseExport } from "../export-parse";
import { exportFile } from "../exporters";
import type { DestId, NormList } from "../model";
import { buildFileReceipt, buildReceipt, newMoveState, runMove, type MoveState } from "../move";
import { buildPreview } from "../preview";
import { download, h } from "./dom";
import { errorsView, inventoryView, previewView, receiptView } from "./views";

export interface Config {
  msClientId: string;
  googleClientId: string;
}
const DESTS: DestId[] = ["todoist", "googleTasks", "csv", "markdown", "json"];
const FILE_DESTS = ["csv", "markdown", "json"];

export function startApp(root: HTMLElement, cfg: Config): void {
  let lists: NormList[] | null = null;
  let dest: DestId = "todoist";
  let todoistToken = "";
  let moveState: MoveState = newMoveState();
  let lastAdapter: WriteAdapter | null = null;
  let busy = false;

  const status = h("p", { role: "status", "aria-live": "polite", class: "muted" });
  const secSignin = h("section", { "aria-labelledby": "h-signin" });
  const secInv = h("section", { "aria-labelledby": "h-inv", hidden: true });
  const secDest = h("section", { "aria-labelledby": "h-dest", hidden: true });
  const secOut = h("section", { "aria-labelledby": "h-out", hidden: true, "aria-live": "polite" });
  const say = (m: string): void => { status.textContent = m; };

  root.append(h("main", {},
    h("h1", {}, "To Do Lifeboat"),
    h("p", {}, "Microsoft is retiring the To Do apps on June 30, 2027. This page moves your tasks to another app and checks that they arrived."),
    h("p", { class: "muted" }, "Your tasks go straight from Microsoft to your new app in your browser; nothing is stored on a server. This is an independent tool and is not affiliated with Microsoft, Google or Todoist."),
    secSignin, secInv, secDest, secOut, status));

  const setupMsg = (name: string, vars: string): HTMLElement =>
    h("div", { class: "card", role: "alert" }, h("strong", {}, `${name} is not set up. `),
      `Set ${vars} in .env.local and restart. See the README for the app registration steps.`);

  function renderSignin(): void {
    secSignin.replaceChildren(h("h2", { id: "h-signin" }, "1. Sign in to Microsoft"));
    if (!cfg.msClientId) { secSignin.append(setupMsg("Microsoft sign-in", "VITE_MS_CLIENT_ID")); return; }
    const btn = h("button", { type: "button", onclick: () => void doSignIn(btn) }, "Sign in and read my tasks");
    secSignin.append(h("p", {}, "Read-only access (Tasks.Read). Works with personal and work or school accounts."), btn);
  }

  async function doSignIn(btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    try {
      say("Signing in...");
      const who = await signIn(cfg.msClientId);
      lists = await loadAll(say);
      say(`Signed in as ${who}.`);
      secInv.hidden = false;
      secInv.replaceChildren(h("h2", { id: "h-inv" }, "2. What was found"), inventoryView(lists));
      secDest.hidden = false;
      renderDest();
    } catch (e) {
      say(`Could not read your tasks: ${(e as Error).message}`);
      btn.disabled = false;
    }
  }

  function renderDest(): void {
    if (!lists) return;
    const radios = DESTS.map((d) => h("label", {}, h("input", {
      type: "radio", name: "dest", value: d, checked: d === dest,
      onchange: () => { dest = d; moveState = newMoveState(); secOut.hidden = true; if (d === "googleTasks" && cfg.googleClientId) void loadGoogleScript().catch(() => undefined); renderDest(); },
    }), ` ${DEST_LABELS[d]}`));
    const action = h("div", {});
    if (dest === "todoist") {
      action.append(h("label", { for: "td-token" }, "Todoist API token (Settings, Integrations, Developer). Kept in memory only; it is gone when you close this tab."),
        h("input", { id: "td-token", type: "password", autocomplete: "off", value: todoistToken, oninput: (e) => { todoistToken = (e.target as HTMLInputElement).value.trim(); } }));
    }
    if (dest === "googleTasks" && !cfg.googleClientId) action.append(setupMsg("Google sign-in", "VITE_GOOGLE_CLIENT_ID"));
    const go = h("button", { type: "button", onclick: () => void doMove(go) }, FILE_DESTS.includes(dest) ? "Download file and verify it" : "Move my tasks");
    if (dest === "googleTasks" && !cfg.googleClientId) go.disabled = true;
    secDest.replaceChildren(
      h("h2", { id: "h-dest" }, "3. Choose where to move them"),
      h("fieldset", {}, h("legend", {}, "Destination"), ...radios),
      previewView(buildPreview(dest, lists)), action, h("p", {}, go));
  }

  async function doMove(btn: HTMLButtonElement): Promise<void> {
    if (!lists || busy) return;
    busy = true; btn.disabled = true;
    secOut.hidden = false;
    const label = DEST_LABELS[dest];
    try {
      if (FILE_DESTS.includes(dest)) {
        const d = dest as "csv" | "markdown" | "json";
        const file = exportFile(d, lists);
        download(file.filename, file.mime, file.content);
        const receipt = buildFileReceipt(parseExport(d, file.content), d, lists);
        secOut.replaceChildren(h("h2", { id: "h-out" }, "4. Receipt"), h("p", {}, `Downloaded ${file.filename}. Checked by reading the file back.`), receiptView(receipt, label));
        return;
      }
      if (!lastAdapter || lastAdapter.id !== dest) moveState = newMoveState();
      if (dest === "todoist") {
        if (!todoistToken) throw new Error("Paste your Todoist API token first.");
        lastAdapter = createTodoistAdapter(todoistToken);
      } else lastAdapter = createGoogleAdapter(await requestGoogleToken(cfg.googleClientId));
      const bar = h("progress", { max: "1", value: "0", "aria-label": "Move progress" });
      secOut.replaceChildren(h("h2", { id: "h-out" }, "4. Moving"), bar);
      await runMove(lastAdapter, lists, moveState, (p) => { bar.max = p.total; bar.value = p.done; say(`${p.done} of ${p.total}: ${p.label}`); });
      say("Reading back from the destination...");
      const receipt = await buildReceipt(lastAdapter, lists, moveState);
      secOut.replaceChildren(h("div", {}, h("h2", { id: "h-out" }, "4. Receipt"),
        moveState.errors.length ? errorsView(moveState.errors) : null, receiptView(receipt, label),
        moveState.errors.length ? h("p", {}, "Run the move again to retry only what failed; items that already arrived are skipped, not duplicated.") : null));
      say("Done.");
    } catch (e) {
      secOut.append(h("p", { class: "bad", role: "alert" }, `Stopped: ${(e as Error).message}`));
      say("Stopped.");
    } finally {
      busy = false; btn.disabled = false;
    }
  }

  renderSignin();
}
