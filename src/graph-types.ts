/** Raw Microsoft Graph v1.0 shapes we read. Field names per docs/api-notes.md. */

export interface GraphDateTimeTimeZone {
  dateTime: string;
  timeZone: string;
}
export interface GraphChecklistItem {
  id?: string;
  displayName?: string;
  isChecked?: boolean;
}
export interface GraphLinkedResource {
  id?: string;
  displayName?: string;
  applicationName?: string;
  externalId?: string;
  webUrl?: string;
}
export interface GraphRecurrence {
  pattern?: {
    type?: string;
    interval?: number;
    daysOfWeek?: string[];
    firstDayOfWeek?: string;
    dayOfMonth?: number;
    month?: number;
    index?: string;
  };
  range?: {
    type?: string;
    startDate?: string;
    recurrenceTimeZone?: string;
    endDate?: string;
    numberOfOccurrences?: number;
  };
}
export interface GraphTask {
  id: string;
  title?: string;
  status?: string;
  importance?: string;
  body?: { content?: string; contentType?: string };
  categories?: string[];
  createdDateTime?: string;
  dueDateTime?: GraphDateTimeTimeZone | null;
  reminderDateTime?: GraphDateTimeTimeZone | null;
  isReminderOn?: boolean;
  hasAttachments?: boolean;
  recurrence?: GraphRecurrence | null;
  checklistItems?: GraphChecklistItem[];
  linkedResources?: GraphLinkedResource[];
}
export interface GraphList {
  id: string;
  displayName?: string;
  wellknownListName?: string;
}
export interface GraphPage<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}
