export class HttpError extends Error {
  constructor(readonly status: number, readonly url: string, readonly body: string) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}
/** A 429 that is still 429 after every retry. The run should pause, not hammer the API. */
export class RateLimitExhaustedError extends HttpError {}
/**
 * A non-idempotent write failed in transit (5xx or no response). The item may or may not exist,
 * so the client does NOT retry it; the caller must look it up first. status is 0 for network errors.
 */
export class AmbiguousWriteError extends HttpError {}

export interface HttpOptions {
  /** Minimum gap between requests made through this client. */
  minIntervalMs: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}
export interface JsonInit {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Safe to repeat. Defaults to true for GET only. */
  idempotent?: boolean;
}

export const MAX_BACKOFF_MS = 60_000;
const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Polite JSON client: spaced requests; 429 is retried (the server did not process it, honours Retry-After,
 * capped at 60 s); 5xx (except 501) and network errors are retried only for idempotent requests.
 */
export class HttpClient {
  private last = 0;
  constructor(private readonly opts: HttpOptions, private readonly headers: () => Promise<Record<string, string>>) {}

  async json<T>(url: string, init: JsonInit = {}): Promise<T> {
    const f = this.opts.fetchImpl ?? fetch;
    const sleep = this.opts.sleep ?? defaultSleep;
    const retries = this.opts.maxRetries ?? 5;
    const method = init.method ?? "GET";
    const idempotent = init.idempotent ?? method === "GET";
    const backoff = (attempt: number): number => Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      const auth = await this.headers();
      let res: Response;
      try {
        res = await f(url, {
          method,
          headers: { ...auth, ...init.headers, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
      } catch (e) {
        if (!idempotent) throw new AmbiguousWriteError(0, url, `network error: ${(e as Error).message}`);
        if (attempt >= retries) throw new Error(`Network error for ${url}: ${(e as Error).message}`);
        await sleep(backoff(attempt));
        continue;
      }
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      const ra = Number(res.headers.get("Retry-After"));
      const delay = Number.isFinite(ra) && ra > 0 ? Math.min(MAX_BACKOFF_MS, ra * 1000) : backoff(attempt);
      if (res.status === 429) {
        if (attempt < retries) { await sleep(delay); continue; }
        throw new RateLimitExhaustedError(429, url, await res.text().catch(() => ""));
      }
      const serverError = res.status >= 500 && res.status !== 501;
      if (serverError && idempotent && attempt < retries) { await sleep(delay); continue; }
      const body = await res.text().catch(() => "");
      if (serverError && !idempotent) throw new AmbiguousWriteError(res.status, url, body);
      throw new HttpError(res.status, url, body);
    }
  }
}
