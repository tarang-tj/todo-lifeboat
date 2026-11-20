import type { GraphList, GraphRecurrence, GraphTask } from "./graph-types";
import type { DayName, Importance, NormList, NormTask, Recurrence, RecurrenceType, TaskStatus } from "./model";

const STATUSES: TaskStatus[] = ["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"];
const TYPES: RecurrenceType[] = ["daily", "weekly", "absoluteMonthly", "relativeMonthly", "absoluteYearly", "relativeYearly"];
const DAYS: DayName[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const INDEXES = ["first", "second", "third", "fourth", "last"] as const;

function mapRecurrence(g: GraphRecurrence | null | undefined): Recurrence | null {
  const p = g?.pattern;
  if (!p?.type || !TYPES.includes(p.type as RecurrenceType)) return null;
  const rt = g?.range?.type;
  return {
    type: p.type as RecurrenceType,
    interval: p.interval && p.interval > 0 ? p.interval : 1,
    daysOfWeek: (p.daysOfWeek ?? []).filter((d): d is DayName => DAYS.includes(d as DayName)),
    dayOfMonth: p.dayOfMonth ?? null,
    month: p.month ?? null,
    index: INDEXES.find((i) => i === p.index) ?? null,
    rangeType: rt === "endDate" || rt === "numbered" ? rt : "noEnd",
    startDate: g?.range?.startDate ?? null,
    endDate: g?.range?.endDate ?? null,
    numberOfOccurrences: g?.range?.numberOfOccurrences ?? null,
  };
}

export function mapTask(g: GraphTask, listId: string): NormTask {
  const status = STATUSES.includes(g.status as TaskStatus) ? (g.status as TaskStatus) : "notStarted";
  const importance: Importance = g.importance === "high" || g.importance === "low" ? g.importance : "normal";
  return {
    sourceId: g.id,
    listId,
    title: (g.title ?? "").trim() || "(untitled)",
    status,
    completed: status === "completed",
    importance,
    dueDateTime: g.dueDateTime?.dateTime ?? null,
    reminderDateTime: g.reminderDateTime?.dateTime ?? null,
    isReminderOn: g.isReminderOn === true,
    recurrence: mapRecurrence(g.recurrence),
    body: g.body?.content ?? "",
    bodyType: g.body?.contentType === "html" ? "html" : "text",
    steps: (g.checklistItems ?? []).map((c) => ({
      title: (c.displayName ?? "").trim() || "(untitled step)",
      checked: c.isChecked === true,
    })),
    categories: g.categories ?? [],
    createdDateTime: g.createdDateTime ?? null,
    hasAttachments: g.hasAttachments === true,
    linkedResourceCount: g.linkedResources?.length ?? 0,
  };
}

export function mapList(g: GraphList, tasks: GraphTask[]): NormList {
  return {
    sourceId: g.id,
    name: (g.displayName ?? "").trim() || "Untitled list",
    wellknown: g.wellknownListName ?? "none",
    tasks: tasks.map((t) => mapTask(t, g.id)),
  };
}
