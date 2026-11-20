import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

broadcastResponseToMainFrame().catch((e: unknown) => {
  document.body.textContent = `Sign-in could not be completed: ${e instanceof Error ? e.message : String(e)}`;
});
