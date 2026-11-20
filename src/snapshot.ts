import { datePart } from "./dates";
import { todoistPriority, todoistRecurrence } from "./destination-text";
import type { DestId, NormList, NormTask, Snapshot } from "./model";

/** What the destination should hold for this task, limited to fields the destination claims to keep. */
export function expectedSnapshot(dest: DestId, t: NormTask): Snapshot {
  const base: Snapshot = { title: t.title, completed: t.completed, dueDate: datePart(t.dueDateTime) };
  const unchecked = t.steps.filter((s) => !s.checked).length;
  switch (dest) {
    case "todoist": {
      const recurring = todoistRecurrence(t) !== null;
      const snap: Snapshot = { title: t.title, completed: t.completed, priority: todoistPriority(t), recurring };
      // Todoist computes the next date for repeat rules, and closes subtasks with a completed parent.
      if (!recurring) snap.dueDate = base.dueDate ?? null;
      if (!t.completed) snap.stepCount = unchecked;
      return snap;
    }
    case "googleTasks":
      return { ...base, stepCount: t.steps.length };
    default:
      return { ...base, stepCount: t.steps.length, importance: t.importance };
  }
}

/**
 * Top-level tasks the destination list should hold. Todoist's task list returns active tasks only,
 * so completed (closed) tasks are not counted there.
 */
export function expectedListCount(dest: DestId, list: NormList, include: (t: NormTask) => boolean = () => true): number {
  return list.tasks.filter((t) => include(t) && (dest !== "todoist" || !t.completed)).length;
}
