import { HttpError, RateLimitExhaustedError } from "./adapters/http";

export class ReauthRequiredError extends Error {
  constructor() {
    super("Microsoft needs you to sign in again.");
  }
}

/** Errors after which continuing would only make things worse: stop and let the user resume. */
export function isFatal(e: unknown): boolean {
  return e instanceof RateLimitExhaustedError || (e instanceof HttpError && (e.status === 401 || e.status === 403));
}

export const PAUSED_MESSAGE = "Paused. Run again to resume.";

/** Plain-language version of an error. Limit wording is UNVERIFIED against live responses. */
export function plainError(e: unknown, dest: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (e instanceof RateLimitExhaustedError) return `${dest} is rate limiting requests. Wait a few minutes, then run again.`;
  if (e instanceof HttpError) {
    if (e.status === 401) return `${dest} rejected the sign-in or token. Check it, then run again.`;
    if (e.status === 403 && /limit|quota|upgrade|premium|max/i.test(e.body)) {
      return `${dest} reports a plan or quota limit (${e.body.slice(0, 120)}). Free up room or upgrade, then run again.`;
    }
    if (e.status === 403) return `${dest} refused the request (403). Check the token and permissions.`;
  }
  return raw;
}
