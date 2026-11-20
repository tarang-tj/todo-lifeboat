import type { GraphList, GraphRecurrence, GraphTask } from "../src/graph-types";

/**
 * Verbatim from the Graph docs "List Todo tasks" example response (shortened by Microsoft there).
 * https://learn.microsoft.com/en-us/graph/api/todotasklist-list-tasks?view=graph-rest-1.0
 */
export const docTask: GraphTask = {
  importance: "low",
  isReminderOn: false,
  status: "notStarted",
  title: "Linked entity new task 1",
  createdDateTime: "2020-07-08T11:15:19.9359889Z",
  categories: ["Important", "Urgent"],
  id: "AQMkADAwATM0MDAAMS0yMDkyLWVjMzYtMDACLTAwCgBGAAAD",
  body: { content: "", contentType: "text" },
  linkedResources: [
    { applicationName: "Partner App Name", displayName: "Partner App Name", externalId: "teset1243434", id: "30911960-7321-4cba-9ba0-cdb68e2984c7" },
  ],
};

/** Verbatim from the Graph docs "List checklistItems" example response. */
export const docChecklist = [
  { displayName: "Create draft", createdDateTime: "2021-11-17T05:22:14.2207813Z", isChecked: false, id: "51d8a471-2e9d-4f53-9937-c33a8742d28f" },
  { displayName: "Review with the team", createdDateTime: "2021-11-17T05:22:43.0916521Z", isChecked: false, id: "a7720293-4ef9-45da-9056-e000796889fa" },
];

export const docList: GraphList = { id: "AAMkADliMmU5YjJlLTVmMmQ=", displayName: "Tasks", wellknownListName: "defaultList" };

/**
 * Recurrence payloads are CONSTRUCTED from the recurrencePattern / recurrenceRange field tables in the docs.
 * No documented To Do example contains one, so the exact on-the-wire shape is UNVERIFIED (docs/api-notes.md).
 */
export const rec = {
  daily: { pattern: { type: "daily", interval: 1 }, range: { type: "noEnd", startDate: "2026-12-01" } },
  every3Days: { pattern: { type: "daily", interval: 3 }, range: { type: "noEnd", startDate: "2026-12-01" } },
  weeklyMonday: { pattern: { type: "weekly", interval: 1, daysOfWeek: ["monday"], firstDayOfWeek: "sunday" }, range: { type: "noEnd", startDate: "2026-12-07" } },
  biweeklyMonWed: { pattern: { type: "weekly", interval: 2, daysOfWeek: ["wednesday", "monday"], firstDayOfWeek: "sunday" }, range: { type: "noEnd", startDate: "2026-12-07" } },
  monthly15: { pattern: { type: "absoluteMonthly", interval: 1, dayOfMonth: 15 }, range: { type: "noEnd", startDate: "2026-12-15" } },
  quarterly15: { pattern: { type: "absoluteMonthly", interval: 3, dayOfMonth: 15 }, range: { type: "noEnd", startDate: "2026-12-15" } },
  secondThursday: { pattern: { type: "relativeMonthly", interval: 1, daysOfWeek: ["thursday"], index: "second" }, range: { type: "noEnd", startDate: "2026-12-10" } },
  lastFriday: { pattern: { type: "relativeMonthly", interval: 1, daysOfWeek: ["friday"], index: "last" }, range: { type: "noEnd", startDate: "2026-12-25" } },
  yearlyMarch15: { pattern: { type: "absoluteYearly", interval: 1, dayOfMonth: 15, month: 3 }, range: { type: "noEnd", startDate: "2027-03-15" } },
  everyOtherYear: { pattern: { type: "absoluteYearly", interval: 2, dayOfMonth: 15, month: 3 }, range: { type: "noEnd", startDate: "2027-03-15" } },
  relYearly: { pattern: { type: "relativeYearly", interval: 1, daysOfWeek: ["thursday"], index: "fourth", month: 11 }, range: { type: "noEnd", startDate: "2026-11-26" } },
  dailyUntil: { pattern: { type: "daily", interval: 1 }, range: { type: "endDate", startDate: "2026-12-01", endDate: "2026-12-31" } },
  tenTimes: { pattern: { type: "daily", interval: 1 }, range: { type: "numbered", startDate: "2026-12-01", numberOfOccurrences: 10 } },
} satisfies Record<string, GraphRecurrence>;

/** A small account: one default list, one project list. Mixes every field kind. */
export function sampleAccount(): { lists: GraphList[]; tasks: Record<string, GraphTask[]> } {
  const day = (d: string) => ({ dateTime: `${d}T00:00:00.0000000`, timeZone: "UTC" });
  return {
    lists: [docList, { id: "L2", displayName: "Home, \"errands\"", wellknownListName: "none" }],
    tasks: {
      [docList.id]: [
        { ...docTask, checklistItems: docChecklist },
        { id: "T2", title: "Pay rent", status: "notStarted", importance: "high", body: { content: "Line one\nLine two", contentType: "text" },
          dueDateTime: day("2026-12-01"), isReminderOn: true, reminderDateTime: { dateTime: "2026-12-01T09:00:00.0000000", timeZone: "UTC" },
          recurrence: rec.monthly15, createdDateTime: "2026-01-01T00:00:00Z", hasAttachments: true },
        { id: "T3", title: "Water plants", status: "completed", importance: "normal", recurrence: rec.biweeklyMonWed, categories: ["Home"] },
      ],
      L2: [
        { id: "T4", title: "=SUM(1,1) spreadsheet", status: "notStarted", importance: "normal", recurrence: rec.quarterly15,
          body: { content: "<p>Hello &amp; welcome</p>", contentType: "html" }, dueDateTime: { dateTime: "2026-12-05T14:30:00.0000000", timeZone: "UTC" } },
        { id: "T5", title: "Plain", status: "inProgress" },
      ],
    },
  };
}
