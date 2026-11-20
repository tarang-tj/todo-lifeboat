import type { WriteAdapter } from "../adapters/adapter";
import { createGoogleAdapter } from "../adapters/google";
import { loadGoogleScript, requestGoogleToken } from "../adapters/google-auth";
import { createTodoistAdapter } from "../adapters/todoist";
import { DEST_LABELS } from "../capabilities";
import { parseExport } from "../export-parse";
import { exportFile } from "../exporters";
import type { DestId, NormList } from "../model";
import { buildFileReceipt, buildReceipt, countWork, runMove, type MoveState } from "../move";
import { clearState, loadState, saveState, storeKey } from "../move-store";
import { buildPreview } from "../preview";
import { download, h } from "./dom";
import { moveSummary, previewView, receiptView, todoistTokenInput } from "./views";

export interface Config {
  msClientId: string;
  googleClientId: string;
}
export interface Ctx {
  cfg: Config;
  lists: NormList[] | null;
  accountId: string;
  storage: Storage;
  say: (m: string) => void;
}
const DESTS: DestId[] = ["todoist", "googleTasks", "csv", "markdown", "json"];
const FILE_DESTS = ["csv", "markdown", "json"];

/** Destination picker, preview, move and receipt. One MoveState per destination, never reset by switching. */
export function createDestUI(ctx: Ctx, secDest: HTMLElement, secOut: HTMLElement) {
  let dest: DestId = "todoist";
  let todoistToken = "";
  let googleReady = false;
  let busy = false;
  const states = new Map<DestId, MoveState>();
  const adapters = new Map<DestId, WriteAdapter>();
  const key = (d: DestId): string => storeKey(d, ctx.accountId);
  const stateFor = (d: DestId): MoveState => {
    let s = states.get(d);
    if (!s) states.set(d, (s = loadState(ctx.storage, key(d))));
    return s;
  };
  const setup = (name: string, vars: string): HTMLElement =>
    h("div", { class: "card", role: "alert" }, h("strong", {}, `${name} is not set up. `),
      // Setup hints are for the developer; a visitor on the deployed site gets a plain next step.
      import.meta.env.DEV ? `Set ${vars} in .env.local and restart. See the README.` : "It isn't available on this site yet. Choose another destination, or download a file.");

  function render(): void {
    if (!ctx.lists) return;
    const radios = DESTS.map((d) => h("label", {}, h("input", {
      type: "radio", name: "dest", value: d, checked: d === dest,
      onchange: () => { dest = d; secOut.hidden = true; if (d === "googleTasks") prepareGoogle(); render(); },
    }), ` ${DEST_LABELS[d]}`));
    const action = h("div", {});
    if (dest === "todoist") {
      action.append(h("label", { for: "td-token" }, "Todoist API token (Settings, Integrations, Developer). Kept in memory only; it is gone when you close this tab."),
        todoistTokenInput(todoistToken, (v) => { todoistToken = v; }));
    }
    const noGoogle = dest === "googleTasks" && !ctx.cfg.googleClientId;
    if (noGoogle) action.append(setup("Google sign-in", "VITE_GOOGLE_CLIENT_ID"));
    const go = h("button", { type: "button", onclick: () => void doMove(go) }, FILE_DESTS.includes(dest) ? "Download file and verify it" : "Move my tasks");
    if (noGoogle || (dest === "googleTasks" && !googleReady)) go.disabled = true;
    const done = stateFor(dest).taskMap.size;
    const reset = done && !FILE_DESTS.includes(dest)
      ? h("button", { type: "button", class: "secondary", onclick: () => { states.delete(dest); clearState(ctx.storage, key(dest)); render(); } }, `Forget saved progress (${done} items)`) : null;
    secDest.replaceChildren(h("div", {},
      h("h2", { id: "h-dest" }, "3. Choose where to move them"),
      h("fieldset", {}, h("legend", {}, "Destination"), ...radios),
      previewView(buildPreview(dest, ctx.lists)), action,
      done && !FILE_DESTS.includes(dest) ? h("p", { class: "muted" }, `Progress for ${DEST_LABELS[dest]} is saved in this tab. Running again resumes and skips what already moved.`) : null,
      h("p", {}, go, " ", reset)));
  }

  function prepareGoogle(): void {
    if (!ctx.cfg.googleClientId || googleReady) return;
    loadGoogleScript().then(() => { googleReady = true; if (dest === "googleTasks") render(); })
      .catch((e: Error) => ctx.say(e.message));
  }

  async function verify(): Promise<void> {
    const adapter = adapters.get(dest);
    const lists = ctx.lists;
    if (!adapter || !lists) return;
    const state = stateFor(dest);
    show(adapter, state, null, "Reading back from the destination...");
    try {
      show(adapter, state, await buildReceipt(adapter, lists, state), null);
    } catch (e) {
      show(adapter, state, null, `Read-back failed: ${(e as Error).message}`);
    }
  }

  /** Always shows the move counts and errors, even when the read-back failed. */
  function show(adapter: WriteAdapter, state: MoveState, receipt: Awaited<ReturnType<typeof buildReceipt>> | null, note: string | null): void {
    const lists = ctx.lists ?? [];
    const label = DEST_LABELS[dest];
    const retry = note?.startsWith("Read-back failed") ? h("p", {}, h("button", { type: "button", onclick: () => void verify() }, "Verify again")) : null;
    secOut.replaceChildren(h("div", {}, h("h2", { id: "h-out" }, "4. Result"),
      moveSummary(state.taskMap.size + state.listMap.size, countWork(lists), state.errors, state.paused),
      note ? h("p", { class: note.startsWith("Read-back failed") ? "bad" : "muted" }, note) : null, retry,
      receipt ? receiptView(receipt, label, { errorCount: state.errors.length, warnings: adapter.warnings }) : null,
      state.errors.length || state.paused ? h("p", {}, "Run the move again to retry only what failed; items that already arrived are skipped, not duplicated.") : null));
  }

  async function doMove(btn: HTMLButtonElement): Promise<void> {
    const lists = ctx.lists;
    if (!lists || busy) return;
    busy = true; btn.disabled = true; secOut.hidden = false;
    try {
      if (FILE_DESTS.includes(dest)) {
        const d = dest as "csv" | "markdown" | "json";
        const file = exportFile(d, lists);
        download(file.filename, file.mime, file.content);
        secOut.replaceChildren(h("div", {}, h("h2", { id: "h-out" }, "4. Receipt"), h("p", {}, `Downloaded ${file.filename}. Checked by reading the file back.`),
          receiptView(buildFileReceipt(parseExport(d, file.content), d, lists), DEST_LABELS[d])));
        return;
      }
      let adapter: WriteAdapter;
      if (dest === "todoist") {
        if (!todoistToken) throw new Error("Paste your Todoist API token first.");
        adapter = createTodoistAdapter(todoistToken);
      } else adapter = createGoogleAdapter(await requestGoogleToken(ctx.cfg.googleClientId));
      adapters.set(dest, adapter);
      const state = stateFor(dest);
      const bar = h("progress", { max: "1", value: "0", "aria-label": "Move progress" });
      secOut.replaceChildren(h("div", {}, h("h2", { id: "h-out" }, "4. Moving"), bar));
      await runMove(adapter, lists, state, (p) => { bar.max = p.total; bar.value = p.done; ctx.say(`${p.done} of ${p.total}: ${p.label}`); },
        () => saveState(ctx.storage, key(dest), state));
      ctx.say(state.paused ?? "Moved. Reading back...");
      if (state.paused) { show(adapter, state, null, null); return; }
      await verify();
      ctx.say("Done.");
    } catch (e) {
      secOut.append(h("p", { class: "bad", role: "alert" }, `Stopped: ${(e as Error).message}`));
      ctx.say("Stopped.");
    } finally {
      busy = false; btn.disabled = false; render();
    }
  }

  return { render };
}
