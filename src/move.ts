import type { WriteAdapter } from "./adapters/adapter";
import type { NormList, Snapshot } from "./model";
import { reconcile, type Receipt } from "./reconcile";
import { expectedSnapshot } from "./snapshot";

export interface MoveError {
  sourceId: string;
  title: string;
  stage: "list" | "task" | "step";
  message: string;
}
/** Held in memory so a retry skips what already arrived and never duplicates it. */
export interface MoveState {
  listMap: Map<string, string>;
  /** sourceId -> destination id. Steps use `${sourceId}#${index}`. */
  taskMap: Map<string, string>;
  errors: MoveError[];
  skippedAlreadyMoved: number;
}
export interface Progress {
  done: number;
  total: number;
  label: string;
}

export const newMoveState = (): MoveState => ({ listMap: new Map(), taskMap: new Map(), errors: [], skippedAlreadyMoved: 0 });

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const stepKey = (sourceId: string, i: number): string => `${sourceId}#${i}`;
export const countWork = (lists: NormList[]): number =>
  lists.reduce((n, l) => n + 1 + l.tasks.reduce((m, t) => m + 1 + t.steps.length, 0), 0);

/** Creates lists, tasks and steps in order. Every failure is recorded; nothing is skipped silently. */
export async function runMove(
  adapter: WriteAdapter, lists: NormList[], state: MoveState, onProgress: (p: Progress) => void,
): Promise<MoveState> {
  state.errors = [];
  state.skippedAlreadyMoved = 0;
  const total = countWork(lists);
  let done = 0;
  const tick = (label: string, by = 1): void => {
    done += by;
    onProgress({ done, total, label });
  };

  for (const list of lists) {
    let destList = state.listMap.get(list.sourceId);
    if (destList) state.skippedAlreadyMoved++;
    else {
      try {
        destList = await adapter.createList(list);
        state.listMap.set(list.sourceId, destList);
      } catch (e) {
        state.errors.push({ sourceId: list.sourceId, title: list.name, stage: "list", message: msg(e) });
      }
    }
    tick(`List: ${list.name}`);
    if (!destList) {
      for (const t of list.tasks) {
        state.errors.push({ sourceId: t.sourceId, title: t.title, stage: "task", message: "Not attempted: its list could not be created" });
      }
      tick(`Skipped list ${list.name}`, list.tasks.reduce((n, t) => n + 1 + t.steps.length, 0));
      continue;
    }
    for (const t of list.tasks) {
      let parent = state.taskMap.get(t.sourceId);
      if (parent) state.skippedAlreadyMoved++;
      else {
        try {
          parent = await adapter.createTask(destList, t);
          state.taskMap.set(t.sourceId, parent);
        } catch (e) {
          state.errors.push({ sourceId: t.sourceId, title: t.title, stage: "task", message: msg(e) });
        }
      }
      tick(t.title);
      for (const [i, s] of t.steps.entries()) {
        const key = stepKey(t.sourceId, i);
        if (!parent) {
          state.errors.push({ sourceId: key, title: s.title, stage: "step", message: "Not attempted: parent task failed" });
        } else if (state.taskMap.has(key)) {
          state.skippedAlreadyMoved++;
        } else {
          try {
            state.taskMap.set(key, await adapter.createStep(destList, parent, s));
          } catch (e) {
            state.errors.push({ sourceId: key, title: s.title, stage: "step", message: msg(e) });
          }
        }
        tick(s.title);
      }
    }
  }
  return state;
}

/** Read the destination back and reconcile against the source. */
export async function buildReceipt(adapter: WriteAdapter, lists: NormList[], state: MoveState): Promise<Receipt> {
  const completedIds = lists
    .flatMap((l) => l.tasks.filter((t) => t.completed).map((t) => state.taskMap.get(t.sourceId)))
    .filter((x): x is string => !!x);
  const readBack = await adapter.readBack([...state.listMap.values()], completedIds);
  const expected = new Map<string, { title: string; snapshot: Snapshot }>();
  const actual = new Map<string, Snapshot>();
  const failed = new Set<string>();
  for (const l of lists) {
    for (const t of l.tasks) {
      expected.set(t.sourceId, { title: t.title, snapshot: expectedSnapshot(adapter.id, t) });
      const destId = state.taskMap.get(t.sourceId);
      if (!destId) failed.add(t.sourceId);
      const got = destId ? readBack.get(destId) : undefined;
      if (got) actual.set(t.sourceId, got);
    }
  }
  return reconcile({ expected, actual, failed });
}

/** Receipt for a generated file: re-parse the file text, then reconcile against the source. */
export function buildFileReceipt(parsed: Map<string, Snapshot>, dest: "csv" | "markdown" | "json", lists: NormList[]): Receipt {
  const expected = new Map<string, { title: string; snapshot: Snapshot }>();
  for (const l of lists) for (const t of l.tasks) expected.set(t.sourceId, { title: t.title, snapshot: expectedSnapshot(dest, t) });
  return reconcile({ expected, actual: parsed });
}
