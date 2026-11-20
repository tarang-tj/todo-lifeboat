import type { NormList, NormTask, Snapshot, Step } from "../model";

export interface ReadBack {
  /** Destination task id -> snapshot. */
  tasks: Map<string, Snapshot>;
  /** Destination list id -> number of top-level tasks found. */
  listCounts: Map<string, number>;
}

/** A destination that can be written to and read back. */
export interface WriteAdapter {
  readonly id: "todoist" | "googleTasks";
  /** Notes about fallbacks, reused lists and recovered writes. Shown in the receipt. */
  readonly warnings: string[];
  /** Reuses an existing list with the same name (and warns) instead of creating a duplicate. */
  createList(list: NormList): Promise<string>;
  /** `previousId` is the destination id of the preceding sibling, to keep order. */
  createTask(destListId: string, task: NormTask, previousId?: string): Promise<string>;
  createStep(destListId: string, parentDestId: string, step: Step, previousId?: string): Promise<string>;
  /** Present when completion is a separate call after creation (Todoist). */
  closeTask?(destId: string): Promise<void>;
  readBack(destListIds: string[], completedTaskIds: string[]): Promise<ReadBack>;
}
