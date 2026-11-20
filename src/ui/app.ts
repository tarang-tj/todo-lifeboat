import { accountName, loadAll, signIn, signOut } from "../adapters/graph";
import { ReauthRequiredError } from "../errors";
import { h } from "./dom";
import { createDestUI, type Config, type Ctx } from "./dest";
import { inventoryView } from "./views";

export type { Config };

export function startApp(root: HTMLElement, cfg: Config, storage: Storage = sessionStorage): void {
  const ctx: Ctx = { cfg, lists: null, accountId: "", storage, say: (m) => { status.textContent = m; } };
  const status = h("p", { role: "status", "aria-live": "polite", class: "muted" });
  const secSignin = h("section", { "aria-labelledby": "h-signin" });
  const secInv = h("section", { "aria-labelledby": "h-inv", hidden: true });
  const secDest = h("section", { "aria-labelledby": "h-dest", hidden: true });
  const secOut = h("section", { "aria-labelledby": "h-out", hidden: true, "aria-live": "polite" });
  const destUI = createDestUI(ctx, secDest, secOut);

  root.append(h("main", {},
    h("h1", {}, "To Do Lifeboat"),
    h("p", {}, "Microsoft is retiring the To Do apps on June 30, 2027. This page moves your tasks to another app and checks that they arrived."),
    h("p", { class: "muted" }, "Your tasks go straight from Microsoft to your new app in your browser; nothing is stored on a server. This is an independent tool and is not affiliated with Microsoft, Google or Todoist."),
    secSignin, secInv, secDest, secOut, status));

  function renderSignin(label = "Sign in and read my tasks"): void {
    secSignin.replaceChildren(h("h2", { id: "h-signin" }, "1. Sign in to Microsoft"));
    if (!cfg.msClientId) {
      secSignin.append(h("div", { class: "card", role: "alert" }, h("strong", {}, "Microsoft sign-in is not set up. "), "Set VITE_MS_CLIENT_ID in .env.local and restart. See the README for the app registration steps."));
      return;
    }
    const btn = h("button", { type: "button", onclick: () => void doSignIn(btn) }, label);
    secSignin.append(h("p", {}, "Read-only access (Tasks.Read). Works with personal and work or school accounts."), btn);
  }

  async function doSignIn(btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    try {
      ctx.say("Signing in...");
      ctx.accountId = await signIn(cfg.msClientId);
      ctx.lists = await loadAll(ctx.say);
      ctx.say(`Signed in as ${accountName()}.`);
      secSignin.replaceChildren(h("h2", { id: "h-signin" }, "1. Signed in"),
        h("p", {}, `Signed in as ${accountName()}. `, h("button", { type: "button", class: "secondary", onclick: () => void doSignOut() }, "Sign out")));
      secInv.hidden = false;
      secInv.replaceChildren(h("div", {}, h("h2", { id: "h-inv" }, "2. What was found"), inventoryView(ctx.lists)));
      secDest.hidden = false;
      destUI.render();
    } catch (e) {
      // Token expired or popup needed: a fresh click is a user gesture, so offer it instead of opening a popup here.
      if (e instanceof ReauthRequiredError) { ctx.say(e.message); renderSignin("Re-authorize"); return; }
      ctx.say(`Could not read your tasks: ${(e as Error).message}`);
      btn.disabled = false;
    }
  }

  async function doSignOut(): Promise<void> {
    await signOut();
    ctx.lists = null;
    ctx.accountId = "";
    secInv.hidden = secDest.hidden = secOut.hidden = true;
    ctx.say("Signed out. Nothing from your account is kept in this page.");
    renderSignin();
  }

  renderSignin();
}
