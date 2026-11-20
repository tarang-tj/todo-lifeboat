import type { NormList, NormTask, Snapshot, Step } from "../model";

/** A destination that can be written to and read back. */
export interface WriteAdapter {
  readonly id: "todoist" | "googleTasks";
  createList(list: NormList): Promise<string>;
  createTask(destListId: string, task: NormTask): Promise<string>;
  createStep(destListId: string, parentDestId: string, step: Step): Promise<string>;
  /** Read tasks back for the given destination containers; keyed by destination task id. */
  readBack(destListIds: string[], completedTaskIds: string[]): Promise<Map<string, Snapshot>>;
}
