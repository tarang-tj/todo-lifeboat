import type { WriteAdapter } from "./adapters/adapter";
import { isFatal, PAUSED_MESSAGE, plainError } from "./errors";
import type { NormList, Snapshot } from "./model";
import { reconcile, type ListCount, type Receipt } from "./reconcile";
import { expectedListCount, expectedSnapshot } from "./snapshot";

export interface MoveError {
  sourceId: string;
  title: string;
  stage: "list" | "task" | "step" | "close";
  message: string;
}
/** Held in memory (and checkpointed to sessionStorage) so a retry skips what arrived and never duplicates it. */
export interface MoveState {
  listMap: Map<string, string>;
  /** sourceId -> destination id. Steps use `${sourceId}#${index}`. */
  taskMap: Map<string, string>;
  /** Keys (as in taskMap) already closed in the destination. Closing is its own retryable stage. */
  closed: Set<string>;
  errors: MoveError[];
  skippedAlreadyMoved: number;
  /** Set when the run stopped early (auth failure or exhausted rate limit). */
  paused: string | null;
}
export interface Progress {
  done: number;
  total: number;
  label: string;
}

export const newMoveState = (): MoveState => ({
  listMap: new Map(), taskMap: new Map(), closed: new Set(), errors: [], skippedAlreadyMoved: 0, paused: null,
});
export const stepKey = (sourceId: string, i: number): string => `${sourceId}#${i}`;
export const countWork = (lists: NormList[]): number =>
  lists.reduce((n, l) => n + 1 + l.tasks.reduce((m, t) => m + 1 + t.steps.length, 0), 0);

class Stop extends Error {}
const CHECKPOINT_EVERY = 25;

/**
 * Creates lists, tasks and steps in order, then closes what must be closed. Every failure is recorded;
 * nothing is skipped silently. A fatal error (401/403, exhausted 429) pauses the run.
 */
export async function runMove(
  adapter: WriteAdapter, lists: NormList[], state: MoveState, onProgress: (p: Progress) => void,
  onCheckpoint: () => void = () => undefined,
): Promise<MoveState> {
  state.errors = [];
  state.skippedAlreadyMoved = 0;
  state.paused = null;
  const total = countWork(lists);
  let done = 0;
  let writes = 0;
  const tick = (label: string, by = 1): void => {
    done += by;
    onProgress({ done, total, label });
  };
  const fail = (e: unknown, sourceId: string, title: string, stage: MoveError["stage"]): void => {
    state.errors.push({ sourceId, title, stage, message: plainError(e, adapter.id) });
    if (isFatal(e)) {
      state.paused = PAUSED_MESSAGE;
      throw new Stop();
    }
  };
  const wrote = (): void => {
    if (++writes % CHECKPOINT_EVERY === 0) onCheckpoint();
  };
  const close = async (key: string, destId: string, title: string): Promise<void> => {
    if (!adapter.closeTask || state.closed.has(key)) return;
    try {
      await adapter.closeTask(destId);
      state.closed.add(key);
      wrote();
    } catch (e) {
      fail(e, key, title, "close");
    }
  };

  try {
    for (const list of lists) {
      let destList = state.listMap.get(list.sourceId);
      if (destList) state.skippedAlreadyMoved++;
      else {
        try {
          destList = await adapter.createList(list);
          state.listMap.set(list.sourceId, destList);
          wrote();
        } catch (e) {
          fail(e, list.sourceId, list.name, "list");
        }
      }
      tick(`List: ${list.name}`);
      if (!destList) {
        for (const t of list.tasks) fail(new Error("Not attempted: its list could not be created"), t.sourceId, t.title, "task");
        tick(`Skipped list ${list.name}`, list.tasks.reduce((n, t) => n + 1 + t.steps.length, 0));
        continue;
      }
      let prevTop: string | undefined;
      for (const t of list.tasks) {
        let parent = state.taskMap.get(t.sourceId);
        if (parent) state.skippedAlreadyMoved++;
        else {
          try {
            parent = await adapter.createTask(destList, t, prevTop);
            state.taskMap.set(t.sourceId, parent); // recorded before any close, so a close failure never causes a re-create
            wrote();
          } catch (e) {
            fail(e, t.sourceId, t.title, "task");
          }
        }
        if (parent) prevTop = parent;
        tick(t.title);
        let prevStep: string | undefined;
        for (const [i, s] of t.steps.entries()) {
          const key = stepKey(t.sourceId, i);
          if (!parent) {
            fail(new Error("Not attempted: parent task failed"), key, s.title, "step");
          } else if (state.taskMap.has(key)) {
            state.skippedAlreadyMoved++;
          } else {
            try {
              state.taskMap.set(key, await adapter.createStep(destList, parent, s, prevStep));
              wrote();
            } catch (e) {
              fail(e, key, s.title, "step");
            }
          }
          prevStep = state.taskMap.get(key) ?? prevStep;
          tick(s.title);
        }
        if (!parent) continue;
        // Steps exist before the parent is closed: closing a Todoist parent closes its subtasks.
        if (t.completed) await close(t.sourceId, parent, t.title);
        else {
          for (const [i, s] of t.steps.entries()) {
            const id = state.taskMap.get(stepKey(t.sourceId, i));
            if (s.checked && id) await close(stepKey(t.sourceId, i), id, s.title);
          }
        }
      }
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  } finally {
    onCheckpoint();
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
  const listCounts: ListCount[] = [];
  for (const l of lists) {
    for (const t of l.tasks) {
      expected.set(t.sourceId, { title: t.title, snapshot: expectedSnapshot(adapter.id, t) });
      const destId = state.taskMap.get(t.sourceId);
      if (!destId) failed.add(t.sourceId);
      const got = destId ? readBack.tasks.get(destId) : undefined;
      if (got) actual.set(t.sourceId, got);
    }
    const destList = state.listMap.get(l.sourceId);
    const found = destList === undefined ? undefined : readBack.listCounts.get(destList);
    if (found !== undefined) {
      listCounts.push({ list: l.name, expected: expectedListCount(adapter.id, l, (t) => state.taskMap.has(t.sourceId)), actual: found });
    }
  }
  return reconcile({ expected, actual, failed, listCounts });
}

/** Receipt for a generated file: re-parse the file text, then reconcile against the source. */
export function buildFileReceipt(parsed: Map<string, Snapshot>, dest: "csv" | "markdown" | "json", lists: NormList[]): Receipt {
  const expected = new Map<string, { title: string; snapshot: Snapshot }>();
  for (const l of lists) for (const t of l.tasks) expected.set(t.sourceId, { title: t.title, snapshot: expectedSnapshot(dest, t) });
  return reconcile({ expected, actual: parsed });
}
