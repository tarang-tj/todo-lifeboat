import { hasTimeOfDay } from "./dates";
import { googleNotes, todoistRecurrence } from "./destination-text";
import type { DestId, NormTask } from "./model";

export type Fate = "kept" | "transformed" | "lost";
export type FieldKey =
  | "completed" | "importance" | "due" | "reminder" | "recurrence" | "notes"
  | "steps" | "categories" | "created" | "attachments" | "linkedResources";

export const FIELD_LABELS: Record<FieldKey, string> = {
  completed: "Completed state",
  importance: "Importance (non-default)",
  due: "Due date",
  reminder: "Reminder",
  recurrence: "Repeat rule",
  notes: "Notes",
  steps: "Steps",
  categories: "Categories",
  created: "Created time",
  attachments: "Attachments",
  linkedResources: "Linked items",
};
export const FIELDS = Object.keys(FIELD_LABELS) as FieldKey[];

export const DEST_LABELS: Record<DestId, string> = {
  todoist: "Todoist",
  googleTasks: "Google Tasks",
  csv: "CSV file",
  markdown: "Markdown file",
  json: "JSON file",
};

export interface FateInfo {
  fate: Fate;
  note: string;
}
const k = (note = ""): FateInfo => ({ fate: "kept", note });
const x = (note: string): FateInfo => ({ fate: "transformed", note });
const l = (note: string): FateInfo => ({ fate: "lost", note });

/** Does this task carry the field at all? Only tasks that do are counted. */
export function hasField(t: NormTask, f: FieldKey): boolean {
  switch (f) {
    case "completed": return t.completed;
    case "importance": return t.importance !== "normal";
    case "due": return t.dueDateTime !== null;
    case "reminder": return t.isReminderOn && t.reminderDateTime !== null;
    case "recurrence": return t.recurrence !== null;
    case "notes": return t.body.trim() !== "";
    case "steps": return t.steps.length > 0;
    case "categories": return t.categories.length > 0;
    case "created": return t.createdDateTime !== null;
    case "attachments": return t.hasAttachments;
    case "linkedResources": return t.linkedResourceCount > 0;
  }
}

const COUNT_ONLY = "Count only; files and links are not moved";

function todoist(f: FieldKey, t: NormTask): FateInfo {
  switch (f) {
    case "completed": return x("Created, then marked complete");
    case "importance": return t.importance === "high" ? x("High becomes priority 4 (urgent)") : l("Todoist has no low priority");
    case "due": return todoistRecurrence(t) ? x("Next date is set by Todoist from the repeat rule") : k();
    case "reminder": return l("Reminders are not set");
    case "recurrence": return todoistRecurrence(t) ? x("Becomes a Todoist repeat phrase") : x("Not expressible; kept as text in the description, task will not repeat");
    case "notes": return t.bodyType === "html" ? x("HTML flattened to plain text") : k();
    case "steps": return x("Become subtasks");
    case "categories": return x("Become labels");
    case "created": return l("Todoist sets its own creation time");
    case "attachments":
    case "linkedResources": return l(COUNT_ONLY);
  }
}

function google(f: FieldKey, t: NormTask): FateInfo {
  switch (f) {
    case "completed": return k();
    case "importance": return l("Google Tasks has no priority");
    case "due": return hasTimeOfDay(t.dueDateTime) ? x("Date only; time of day dropped") : k("Date only");
    case "reminder": return l("Google Tasks has no reminders in its API");
    case "recurrence": return x("Kept as text in notes, task will not repeat");
    case "notes":
      if (googleNotes(t).truncated) return x("Notes cut to 8192 characters");
      return t.bodyType === "html" ? x("HTML flattened to plain text") : k();
    case "steps": return x("Become subtasks");
    case "categories": return x("Listed as text in notes");
    case "created": return l("Google Tasks sets its own creation time");
    case "attachments":
    case "linkedResources": return l(COUNT_ONLY);
  }
}

function file(dest: "csv" | "markdown" | "json", f: FieldKey, t: NormTask): FateInfo {
  switch (f) {
    case "recurrence": return dest === "json" ? k("Structured") : x("Written as text");
    case "steps": return dest === "csv" ? x("One cell, one step per line") : k();
    case "notes": return t.bodyType === "html" && dest !== "json" ? x("HTML flattened to plain text") : k();
    case "created": return dest === "markdown" ? l("Not written to Markdown") : k();
    case "attachments":
    case "linkedResources": return x("Count only");
    default: return k();
  }
}

export function fieldFate(dest: DestId, f: FieldKey, t: NormTask): FateInfo {
  if (dest === "todoist") return todoist(f, t);
  if (dest === "googleTasks") return google(f, t);
  return file(dest, f, t);
}
