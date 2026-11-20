import type { GraphPage } from "../graph-types";

/**
 * Follow @odata.nextLink to the end, using the entire URL each time (never extracting the skiptoken).
 * Caps pages as a guard against a server that loops.
 */
export async function pageAll<T>(url: string, get: (u: string) => Promise<GraphPage<T>>, maxPages = 10_000): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  for (let i = 0; next; i++) {
    if (i >= maxPages) throw new Error("Paging did not finish; stopped to avoid a loop");
    const page: GraphPage<T> = await get(next);
    out.push(...(page.value ?? []));
    next = page["@odata.nextLink"];
  }
  return out;
}
