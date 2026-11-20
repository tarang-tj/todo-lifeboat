/** Normalized model: what the app holds in memory after reading Microsoft To Do. */

export type Importance = "low" | "normal" | "high";
export type TaskStatus = "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";

export type DayName = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
export type RecurrenceType =
  | "daily" | "weekly" | "absoluteMonthly" | "relativeMonthly" | "absoluteYearly" | "relativeYearly";

export interface Recurrence {
  type: RecurrenceType;
  interval: number;
  daysOfWeek: DayName[];
  dayOfMonth: number | null;
  month: number | null;
  index: "first" | "second" | "third" | "fourth" | "last" | null;
  rangeType: "noEnd" | "endDate" | "numbered";
  startDate: string | null;
  endDate: string | null;
  numberOfOccurrences: number | null;
}

export interface Step {
  title: string;
  checked: boolean;
}

export interface NormTask {
  sourceId: string;
  listId: string;
  title: string;
  status: TaskStatus;
  completed: boolean;
  importance: Importance;
  /** Graph dateTime string, e.g. 2026-12-01T00:00:00.0000000, or null. */
  dueDateTime: string | null;
  reminderDateTime: string | null;
  isReminderOn: boolean;
  recurrence: Recurrence | null;
  body: string;
  bodyType: "text" | "html";
  steps: Step[];
  categories: string[];
  createdDateTime: string | null;
  hasAttachments: boolean;
  linkedResourceCount: number;
  /** True when linked items could not be read, so the count above is not reliable. */
  linkedResourcesUnknown: boolean;
}

export interface NormList {
  sourceId: string;
  name: string;
  wellknown: string;
  tasks: NormTask[];
}

export type DestId = "todoist" | "googleTasks" | "csv" | "markdown" | "json";

/** The comparable subset of a task, used for read-back reconciliation. */
export interface Snapshot {
  title?: string;
  completed?: boolean;
  /** YYYY-MM-DD or null. */
  dueDate?: string | null;
  stepCount?: number;
  /** Todoist priority 1..4. */
  priority?: number;
  importance?: Importance;
  /** True when the destination holds a repeat rule on the task. */
  recurring?: boolean;
}
