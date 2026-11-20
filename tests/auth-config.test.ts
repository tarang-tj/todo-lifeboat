import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { msalConfig } from "../src/adapters/msal-config";
import { redirectUri } from "../src/adapters/redirect-uri";
import { CSP, injectCsp } from "../csp";
import { preferTimezone } from "../src/tz";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("C1: MSAL redirect bridge", () => {
  it("points the redirect URI at redirect.html next to the page, for root and sub-path deploys", () => {
    expect(redirectUri("http://localhost:5173/?x=1#h")).toBe("http://localhost:5173/redirect.html");
    expect(redirectUri("https://me.github.io/lifeboat/index.html")).toBe("https://me.github.io/lifeboat/redirect.html");
    expect(redirectUri("https://me.github.io/lifeboat/")).toBe("https://me.github.io/lifeboat/redirect.html");
  });
  it("redirect.html loads a module that calls broadcastResponseToMainFrame from the bridge entry", () => {
    expect(read("redirect.html")).toContain('src="/src/redirect.ts"');
    const src = read("src/redirect.ts");
    expect(src).toContain('from "@azure/msal-browser/redirect-bridge"');
    expect(src).toContain("broadcastResponseToMainFrame()");
  });
  it("is a second Vite build input", () => {
    expect(read("vite.config.ts")).toMatch(/redirect:\s*"redirect\.html"/);
  });
});

describe("M2: MSAL config", () => {
  it("keeps tokens in memory, uses the common authority and the bridge redirect", () => {
    const c = msalConfig("cid", "https://x.test/app/");
    expect(c.cache?.cacheLocation).toBe("memoryStorage");
    expect(c.auth).toMatchObject({ clientId: "cid", authority: "https://login.microsoftonline.com/common", redirectUri: "https://x.test/app/redirect.html" });
  });
});

describe("L1: CSP", () => {
  it("has the required directives", () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("script-src 'self' https://accounts.google.com/gsi/client");
    for (const h of ["https://graph.microsoft.com", "https://login.microsoftonline.com", "https://api.todoist.com", "https://tasks.googleapis.com", "https://oauth2.googleapis.com"]) {
      expect(CSP).toMatch(new RegExp(`connect-src[^;]*${h.replace(/\./g, "\\.")}`));
    }
    expect(CSP).toMatch(/frame-src https:\/\/accounts\.google\.com https:\/\/login\.microsoftonline\.com/);
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("base-uri 'none'");
  });
  it("is injected once into both pages' head", () => {
    const out = injectCsp(read("index.html"));
    expect(out).toContain('http-equiv="Content-Security-Policy"');
    expect(injectCsp(out)).toBe(out);
    expect(injectCsp(read("redirect.html"))).toContain(CSP);
  });
});

describe("H7: Prefer header", () => {
  it("asks for the user's zone", () => expect(preferTimezone("America/Los_Angeles")).toBe('outlook.timezone="America/Los_Angeles"'));
});
