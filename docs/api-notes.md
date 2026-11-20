# API notes (read 2026-11-20)

Every field name below was read from the linked page on 2026-11-20. Items marked **UNVERIFIED** could not be confirmed from docs and have not been run against a live account. No live call has been made to any of these APIs by this project.

## Microsoft Graph To Do (v1.0)

Auth: delegated `Tasks.Read`, both for work/school and personal Microsoft accounts
([list tasks](https://learn.microsoft.com/en-us/graph/api/todotasklist-list-tasks?view=graph-rest-1.0)).

| Need | Endpoint |
|---|---|
| Lists | `GET https://graph.microsoft.com/v1.0/me/todo/lists` |
| Tasks | `GET /me/todo/lists/{todoTaskListId}/tasks` |
| Steps | `GET /me/todo/lists/{todoTaskListId}/tasks/{todoTaskId}/checklistItems` ([doc](https://learn.microsoft.com/en-us/graph/api/todotask-list-checklistitems?view=graph-rest-1.0); no OData query params supported) |

### todoTaskList ([doc](https://learn.microsoft.com/en-us/graph/api/resources/todotasklist?view=graph-rest-1.0))
`id`, `displayName`, `isOwner`, `isShared`, `wellknownListName` (`none`, `defaultList`, `flaggedEmails`, `unknownFutureValue`).

### todoTask ([doc](https://learn.microsoft.com/en-us/graph/api/resources/todotask?view=graph-rest-1.0))
`id`, `title`, `status` (`notStarted`, `inProgress`, `completed`, `waitingOnOthers`, `deferred`), `importance` (`low`, `normal`, `high`), `body` (itemBody), `bodyLastModifiedDateTime`, `categories` (string[]), `completedDateTime`, `dueDateTime`, `reminderDateTime`, `startDateTime` (all dateTimeTimeZone), `isReminderOn`, `recurrence` (patternedRecurrence), `hasAttachments`, `createdDateTime`, `lastModifiedDateTime`. Relationships: `checklistItems`, `linkedResources`, `attachments`, `extensions`.

- itemBody ([doc](https://learn.microsoft.com/en-us/graph/api/resources/itembody?view=graph-rest-1.0)): `content`, `contentType` (`text` | `html`).
- dateTimeTimeZone ([doc](https://learn.microsoft.com/en-us/graph/api/resources/datetimetimezone?view=graph-rest-1.0)): `dateTime` like `2017-08-29T04:00:00.0000000`, `timeZone`.
- checklistItem ([doc](https://learn.microsoft.com/en-us/graph/api/resources/checklistitem?view=graph-rest-1.0)): `id`, `displayName`, `isChecked`, `createdDateTime`, `checkedDateTime`.
- linkedResource ([doc](https://learn.microsoft.com/en-us/graph/api/resources/linkedresource?view=graph-rest-1.0)): `id`, `applicationName`, `displayName`, `externalId`, `webUrl`. The list-tasks example response shows `linkedResources` inline on the task.
- patternedRecurrence ([doc](https://learn.microsoft.com/en-us/graph/api/resources/patternedrecurrence?view=graph-rest-1.0)): `pattern`, `range`.
  - recurrencePattern ([doc](https://learn.microsoft.com/en-us/graph/api/resources/recurrencepattern?view=graph-rest-1.0)): `type` (`daily`, `weekly`, `absoluteMonthly`, `relativeMonthly`, `absoluteYearly`, `relativeYearly`), `interval`, `daysOfWeek` (`sunday`..`saturday`), `firstDayOfWeek`, `dayOfMonth`, `index` (`first`, `second`, `third`, `fourth`, `last`), `month` (1-12).
  - recurrenceRange ([doc](https://learn.microsoft.com/en-us/graph/api/resources/recurrencerange?view=graph-rest-1.0)): `type` (`endDate`, `noEnd`, `numbered`), `startDate`, `endDate`, `numberOfOccurrences`, `recurrenceTimeZone`.

### Paging ([doc](https://learn.microsoft.com/en-us/graph/paging))
Follow `@odata.nextLink` with the entire URL until it is absent. Do not extract `$skiptoken`. A page may contain zero results. The retry note says to keep using the nextLink from the last successful response, not one returned by a retried request. The client does this.

### UNVERIFIED (Graph)
- Whether the tasks list accepts `$expand=checklistItems,linkedResources` and `$top`. The list-tasks page only says "some OData query parameters" are supported. The client tries `$expand` first and, on an HTTP 400, falls back to a plain list plus a per-task `checklistItems` call.
- The real JSON shape of `recurrence` on a To Do task. No documented To Do example includes one. Test fixtures build `recurrence` from the pattern/range field tables above, and are labelled as such.
- Whether To Do ever returns `startDateTime`. Not used.
- Personal-account access with MSAL SPA (assumption A1) needs a live sign-in with a registered app. Not run.
- Task `hasAttachments` is documented. Attachment content (`attachments`) is not fetched; the app counts only.

## Todoist ([API v1](https://developer.todoist.com/api/v1/))

Finding: **REST v2 is superseded.** The v1 page says API v1 "unifies the Sync API v9 and the REST API v2"; v9 and REST v2 docs "are still available for reference" ([migration guide](https://developer.todoist.com/api/v1/migrating-from-v9.md)). The plan said "REST v2". This project uses **`https://api.todoist.com/api/v1/`**. The docs do not state a v2 shutdown date.

- Auth: `Authorization: Bearer <token>`; the personal token is on the integrations settings page ([authorization](https://developer.todoist.com/api/v1/authorization.md)).
- **CORS**: "All API endpoints not related to the initial OAuth2 flow support CORS for requests from any origin", with `Access-Control-Allow-Origin` echoing the request origin on every response, allowed headers `Authorization,Content-Type`. A5 (CORS with a bearer token) is supported by docs. Not exercised live.
- Create project: `POST /api/v1/projects`, body `name` (required), `description`, `parent_id`, `color`, `is_favorite`, `view_style` ([OpenAPI](https://developer.todoist.com/openapi.json)). Response carries `id`.
- Create task: `POST /api/v1/tasks`, body `content` (required), `description`, `project_id` (omitted = Inbox), `parent_id` (subtask), `labels` (names), `priority` (1-4), `due_string`, `due_date`, `due_datetime`, `due_lang`, `deadline_date`, `duration`, `duration_unit`. Response is a task with `id`.
- Close task: `POST /api/v1/tasks/{task_id}/close` (regular tasks are completed along with their subtasks).
- List active tasks: `GET /api/v1/tasks?project_id=&cursor=&limit=`; response `{results: [], next_cursor}`; `limit` default 50, max 200 ([pagination](https://developer.todoist.com/api/v1/pagination.md)). Active tasks only. Task object fields used: `id`, `content`, `parent_id`, `priority`, `due` (`{date, string, is_recurring, ...}`), `checked`, `labels`.
- Get one task: `GET /api/v1/tasks/{task_id}`.
- Limits ([request limits](https://developer.todoist.com/api/v1/request-limits.md)): 1 MiB POST body, 15 s standard request timeout. The page gives numeric rate limits only for sync (1000 partial / 100 full per 15 min per user). A numeric limit for the REST task endpoints is not documented there, so the client spaces writes by 250 ms and honours `429` + `Retry-After`.
- Due dates ([doc](https://developer.todoist.com/api/v1/due-dates.md)): `due.string` is human readable, e.g. `every day`, `every day at 12`. Supported natural-language forms are described only by a Help Center link.

### UNVERIFIED / contradictions (Todoist)
- **Priority direction contradicts itself.** The Create Task schema text says "Task priority (1-4, where 1 is highest)", while the task object says "from 1 (normal) to 4 (urgent)". The client sends `4` for To Do `high` (the task-object reading, matching Todoist's long-standing API behaviour). The receipt reads `priority` back and reports a mismatch if it is wrong. Needs one live call to settle.
- Whether `due_string` accepts the exact strings the converter emits (`every 2 weeks on monday, wednesday`, `every 15th`, `every 2nd thursday`, `every last friday`, `every march 15`). The docs only link to Help Center articles. The receipt compares `due.is_recurring` for expressible rules, which is how a rejection shows up.
- Whether unknown label names in `labels` are auto-created. If the create call fails, the client retries once without labels and puts them in the description, and records a warning.
- Whether `GET /tasks/{id}` returns a closed (completed) task. The client treats a 404 as "missing" and says so in the receipt.
- Free-plan project count limits. Not read. A failed project create is reported as an error.

## Google Tasks API

- Resource `Task` ([doc](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks)): `id`, `title` (max 1024), `notes` (max 8192), `status` (`needsAction` | `completed`), `due` ("Only date information is recorded; the time portion of the timestamp is discarded when setting this field"; the API cannot read or write the time), `completed`, `parent` (read-only; `insert` takes it as a query parameter), `position`, `links`.
- Insert ([doc](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/insert)): `POST https://tasks.googleapis.com/tasks/v1/lists/{tasklist}/tasks?parent=&previous=`; scope `https://www.googleapis.com/auth/tasks`. `parent` = ID of parent task, omit for top-level.
- List ([doc](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list)): `GET /tasks/v1/lists/{tasklist}/tasks`, `maxResults` default 20 max 100, `pageToken`, `showCompleted` (default true; tasks completed in first-party clients also need `showHidden=true`), `showHidden`, `showDeleted`; response `items`, `nextPageToken`.
- Task lists ([resource](https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists), [list](https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists/list)): fields `id`, `title`; `POST /tasks/v1/users/@me/lists` inserts (the path form is from the REST convention; the insert page was only read for the method description). List `maxResults` default and max 1000.
- Reminders: the Tasks API resource has no reminder field, so reminders are lost.
- Scope: [auth page](https://developers.google.com/workspace/tasks/auth) and the [scopes index](https://developers.google.com/identity/protocols/oauth2/scopes) list `.../auth/tasks` ("Create, edit, organize, and delete all your tasks") and `.../auth/tasks.readonly` and show **no sensitive or restricted marker**. The index did define "sensitive" scopes as ones with a sensitive indicator, and the tasks entries carry none in the text read. That supports A3, but the consent-screen classification in Google Cloud Console is the authority. **UNVERIFIED** until the console is checked.
- Google Identity Services token model ([guide](https://developers.google.com/identity/oauth2/web/guides/use-token-model)): `google.accounts.oauth2.initTokenClient({client_id, scope, callback})`, then `requestAccessToken()` from a user gesture; the callback receives `access_token` or `error`. Script `https://accounts.google.com/gsi/client` is the URL given in the task brief; the guide page text read did not show it. `error_callback` and `expires_in` are not in the page text read, so the client treats `error_callback` as optional and does not depend on `expires_in`.
- Whether `insert` accepts `status: "completed"` on creation, and CORS from a static origin with a bearer token, are **UNVERIFIED**. The receipt reads `status` back.

## Plan deviations
- Plan A2 said "Todoist's current public API"; docs show this is API v1, not REST v2. Followed the docs.
- Plan said Google "tasks.insert/list with parent and due semantics": confirmed, with the date-only `due` caveat above.
