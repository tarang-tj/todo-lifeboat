export class HttpError extends Error {
  constructor(readonly status: number, readonly url: string, readonly body: string) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}

export interface HttpOptions {
  /** Minimum gap between requests made through this client. */
  minIntervalMs: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Polite JSON client: spaced requests, retry on 429 (honours Retry-After) and 5xx with backoff. */
export class HttpClient {
  private last = 0;
  constructor(private readonly opts: HttpOptions, private readonly headers: () => Promise<Record<string, string>>) {}

  async json<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const f = this.opts.fetchImpl ?? fetch;
    const sleep = this.opts.sleep ?? defaultSleep;
    const retries = this.opts.maxRetries ?? 4;
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      const auth = await this.headers();
      let res: Response;
      try {
        res = await f(url, {
          method: init.method ?? "GET",
          headers: { ...auth, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
      } catch (e) {
        if (attempt >= retries) throw new Error(`Network error for ${url}: ${(e as Error).message}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < retries) {
        const ra = Number(res.headers.get("Retry-After"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** attempt);
        continue;
      }
      throw new HttpError(res.status, url, await res.text().catch(() => ""));
    }
  }
}
