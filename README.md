# To Do Lifeboat

Move your Microsoft To Do tasks to Todoist, Google Tasks, or a CSV, Markdown or JSON file. Before anything moves, it shows what each destination keeps, changes, or loses for your actual tasks. After the move, it reads the destination back and tells you what arrived.

**Try it: https://tarangj.com/todo-lifeboat/**

**Not affiliated with Microsoft, Google or Todoist.** This is an independent tool.

## Why

Microsoft announced on 2026-11-18 that the To Do apps retire on June 30, 2027, and that people on personal Microsoft accounts need to choose another app. Read the announcement: [Introducing unified tasks and plans for Copilot and Microsoft 365](https://techcommunity.microsoft.com/blog/plannerblog/introducing-unified-tasks-and-plans-for-copilot-and-microsoft-365/4573958).

## Status

v1, built from the vendors' API docs and tested against fixtures and scripted HTTP. **It has not been run against a live Microsoft, Todoist or Google account yet.** The open questions are listed in [docs/api-notes.md](docs/api-notes.md) under the UNVERIFIED headings. Try it on a small test list first.

## Privacy

Your tasks go straight from Microsoft to your new app in your browser; nothing is stored on a server. There is no backend and no analytics. The Todoist token is held in memory and disappears when you close the tab. Microsoft and Google tokens are held in memory only. Move progress (which To Do item became which destination item, no task text and no tokens) is saved in the tab's session storage so a stopped run can resume; "Forget saved progress" clears it. The built pages ship a Content Security Policy that limits where the page can connect.

## What moves

| Field | Todoist | Google Tasks | CSV / Markdown / JSON |
|---|---|---|---|
| Title, list | kept (list becomes a project) | kept (list becomes a task list) | kept |
| Completed | created, then closed | kept | kept |
| Steps | subtasks | subtasks | one cell / checkboxes / structured |
| Importance | high becomes priority 4; low is lost | lost | kept |
| Due date | kept (time of day kept) | date only | kept |
| Reminder | lost | lost | kept |
| Repeat rule | a repeat phrase when expressible (for example `every 2 weeks on monday, wednesday`), otherwise text in the description | text in notes (task stops repeating) | text (JSON keeps the structure) |
| Notes | description (HTML flattened) | notes, cut at 8192 characters | kept |
| Categories | labels | listed in notes | kept |
| Created time | lost | lost | kept (not in Markdown) |
| Attachments, linked items | counted, not moved | counted, not moved | count only |

The preview in the app computes these counts for your own data, with a per-task list of what changes.

## Limitations

- Attachments are counted, not moved. Linked items (for example a flagged email link) are counted, not moved.
- Planner is not supported yet.
- My Day is not read; the To Do API reference pages used here do not list it.
- Todoist and Google Tasks do not hold To Do's repeat rules the same way. Rules Todoist cannot express are kept as text and the task stops repeating.
- Todoist's priority direction is described two ways in its docs. The receipt reads priority back and will flag a mismatch if the guess is wrong.
- Todoist's free plan reportedly caps projects and active tasks per project (third-party figures, not in Todoist's API docs); the preview warns when you are over them.
- If a Todoist or Google request fails in transit, the app looks the item up before creating it again. If the destination already has a same-name project or list it is reused, with a warning, so tasks already in it can end up duplicated.
- Browser-only means a very large account (thousands of tasks) takes a while: writes are spaced out to stay inside rate limits.

## Setup

You register two apps yourself. This repository contains no client IDs.

### 1. Microsoft Entra app (required)

1. In the Entra admin center, open App registrations and choose New registration.
2. Supported account types: accounts in any organizational directory and personal Microsoft accounts.
3. Redirect URI: platform Single-page application (SPA), value `http://localhost:5173/redirect.html` for local work, plus `https://your-host/path/redirect.html` when deployed. MSAL Browser v5 returns sign-in popups through this bridge page (`redirect.html`, built from `src/redirect.ts`), so the registered URI must be the bridge page, not the site root. The app derives it as `redirect.html` next to the page that is open.
4. Under API permissions add Microsoft Graph, Delegated, `Tasks.Read`.
5. Copy the Application (client) ID into `VITE_MS_CLIENT_ID`.

Sign-in uses the authorization code flow with PKCE through `@azure/msal-browser` and the `https://login.microsoftonline.com/common` authority. Some work or school tenants require admin consent for apps; this is a tenant policy, not something the app can change. Publishing for the public may need Microsoft publisher verification.

### 2. Google OAuth client (only for the Google Tasks destination)

1. In Google Cloud Console, create or pick a project and enable the Google Tasks API.
2. Configure the OAuth consent screen. While it is in testing mode, add your Google account as a test user.
3. Create an OAuth client ID of type Web application. Add `http://localhost:5173` (and your deployed origin) under Authorized JavaScript origins. No redirect URI is needed for the token flow.
4. Copy the client ID into `VITE_GOOGLE_CLIENT_ID`. The scope requested is `https://www.googleapis.com/auth/tasks`.

### 3. Todoist

No registration. Paste your personal API token (Settings, Integrations, Developer) into the page when you choose Todoist.

## Local development

```sh
cp .env.example .env.local   # fill in the client IDs
npm install
npm run dev                  # http://localhost:5173
```

Without the client IDs the page shows a setup message instead of the sign-in button.

## Checks

```sh
npx tsc --noEmit   # strict typecheck
npm test           # vitest
npm run build      # typecheck + production bundle in dist/
```

`dist/` is static files and can be hosted anywhere. Remember to register `<host>/<path>/redirect.html` as the SPA redirect URI in Entra, and add the hosting origin to the Google client.

## How it is laid out

- `src/mapper.ts`, `src/model.ts`: Graph payload to the normalized model.
- `src/recurrence.ts`: repeat rule to Todoist phrase or plain text.
- `src/capabilities.ts`, `src/preview.ts`: the per-destination matrix and the preview counts.
- `src/exporters.ts`, `src/export-parse.ts`: file output and the re-parse used as the file receipt.
- `src/move.ts`, `src/reconcile.ts`: ordered writes with collected errors, retry without duplicates, and the read-back comparison.
- `src/adapters/`: Microsoft Graph and MSAL, Todoist API v1, Google Tasks, shared HTTP client with throttling.
- `docs/api-notes.md`: the doc pages and exact field names relied on, with UNVERIFIED items.
