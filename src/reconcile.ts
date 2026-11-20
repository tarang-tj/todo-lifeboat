import type { Snapshot } from "./model";

export interface ReconcileInput {
  /** sourceId -> what should be there. */
  expected: Map<string, { title: string; snapshot: Snapshot }>;
  /** sourceId -> what was read back. A missing key means not found. */
  actual: Map<string, Snapshot>;
  /** Tasks whose write already failed; reported as failed, not missing. */
  failed?: Set<string>;
  /** Top-level task count per destination list, expected vs found. Surfaces duplicates. */
  listCounts?: ListCount[];
}
export interface ListCount {
  list: string;
  expected: number;
  actual: number;
}
export interface Mismatch {
  sourceId: string;
  title: string;
  field: keyof Snapshot;
  expected: string;
  actual: string;
}
export interface Receipt {
  total: number;
  arrived: number;
  /** Arrived with no field mismatch. */
  exact: number;
  failed: { sourceId: string; title: string }[];
  missing: { sourceId: string; title: string }[];
  mismatches: Mismatch[];
  /** Lists whose destination count differs from the expected count (extra tasks mean duplicates). */
  listCountDiffs: ListCount[];
}

const show = (v: unknown): string => (v === undefined ? "(none)" : v === null ? "none" : String(v));

export function reconcile(input: ReconcileInput): Receipt {
  const receipt: Receipt = { total: input.expected.size, arrived: 0, exact: 0, failed: [], missing: [], mismatches: [], listCountDiffs: (input.listCounts ?? []).filter((c) => c.expected !== c.actual) };
  for (const [sourceId, { title, snapshot }] of input.expected) {
    if (input.failed?.has(sourceId)) { receipt.failed.push({ sourceId, title }); continue; }
    const got = input.actual.get(sourceId);
    if (!got) { receipt.missing.push({ sourceId, title }); continue; }
    receipt.arrived++;
    let clean = true;
    for (const key of Object.keys(snapshot) as (keyof Snapshot)[]) {
      const want = snapshot[key];
      const have = got[key];
      if (want === undefined || have === undefined) continue; // destination cannot report it: skip, never guess
      if (want !== have) {
        clean = false;
        receipt.mismatches.push({ sourceId, title, field: key, expected: show(want), actual: show(have) });
      }
    }
    if (clean) receipt.exact++;
  }
  return receipt;
}
