import { describe, expect, it } from "vitest";
import { HttpError, RateLimitExhaustedError } from "../src/adapters/http";
import { plainError } from "../src/errors";

describe("H3: plain-language errors", () => {
  it("explains plan limits, rate limits and bad tokens", () => {
    expect(plainError(new HttpError(403, "u", '{"error":"Project limit reached, upgrade"}'), "Todoist")).toMatch(/plan or quota limit/);
    expect(plainError(new HttpError(403, "u", "forbidden"), "Todoist")).toMatch(/refused/);
    expect(plainError(new HttpError(401, "u", ""), "Todoist")).toMatch(/rejected the sign-in/);
    expect(plainError(new RateLimitExhaustedError(429, "u", ""), "Todoist")).toMatch(/rate limiting/);
    expect(plainError(new Error("plain"), "Todoist")).toBe("plain");
  });
});
