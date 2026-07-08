# API reference

All endpoints are Next.js App Router route handlers under `src/app/api/**`. Unless noted
**Auth: user**, every request must carry a valid session — the [middleware](../auth/sessions-and-middleware.md)
returns `401` for unauthenticated `/api/*`, and handlers also call `getUser(req)` as
defense-in-depth. All data is scoped to the caller; `[id]` routes return **404** (not 403)
for rows the caller doesn't own (see [data model](../architecture/data-model.md)).

Conventions: request/response bodies are JSON. `[id]` is an integer path segment.

## Auth

| Method / Path | Auth | Purpose |
|---|---|---|
| `GET /api/auth/login` | public | Start OIDC login; redirect to Authentik. `?returnTo=` (sanitized). |
| `GET /api/auth/callback` | public | OIDC callback; sets session, redirects to `returnTo`. |
| `POST /api/auth/logout` | public | RP-initiated logout; clears session, ends IdP session. |

See [OIDC flow](../auth/oidc-flow.md).

## Applications

| Method / Path | Purpose |
|---|---|
| `GET /api/applications` | List (with contact + resume count). Lazily expires the caller's stale applications first. |
| `POST /api/applications` | Create. Body: `roleTitle` (req), `company?`, `contactId?`/`contactName?`, detail fields, `appliedAt?` (ISO date) or `markApplied?` (today). → `{ id }`. |
| `GET /api/applications/[id]` | Full detail: app, contact, resume summaries (`hasDocx`/`hasPdf`), interviews (incl. prep pack), drafts, events, uploaded `files` (metadata only). |
| `PATCH /api/applications/[id]` | Partial update; accepts `appliedAt` (ISO date, or `null` to clear); status change logs an event. |
| `DELETE /api/applications/[id]` | Delete (children cascade). |
| `POST /api/applications/[id]/generate` | Generate a tailored resume version → `{ resumeId }`. 404 if app not owned. |
| `POST /api/applications/[id]/drafts` | Generate + store a draft. Body: `type` (`reply`\|`cover_letter`\|`follow_up`), `extra?`. |
| `POST /api/applications/[id]/interviews` | Add an interview round. |
| `GET /api/applications/[id]/files` | List uploaded document metadata (no bytes). |
| `POST /api/applications/[id]/files` | Upload a benefits document. `multipart/form-data` with a PDF `file` (PDF-only, ≤10MB). → file metadata. |
| `GET /api/applications/[id]/files/[fileId]` | Stream the file bytes. `?inline=1` to preview. |
| `DELETE /api/applications/[id]/files/[fileId]` | Delete an uploaded document. |

See [applications & tracking](../features/applications-and-tracking.md) and
[offer comparison](../features/offer-comparison.md).

## Capture

| Method / Path | Purpose |
|---|---|
| `POST /api/capture` | Extract structured fields from pasted text + duplicate check. **Persists nothing.** Body: `text` (req), `companyHint?`, `contactHint?`. → `{ extracted, duplicates, dedupWindowDays }`. |

## Resumes

| Method / Path | Purpose |
|---|---|
| `GET /api/resumes/[id]` | Resume metadata + parsed `content` and `chat` (no file blobs). |
| `PATCH /api/resumes/[id]` | Save edited `content` (re-renders), set `status`, or `markSent`. |
| `POST /api/resumes/[id]/refine` | Apply free-text `feedback`; re-renders. |
| `GET /api/resumes/[id]/download` | Stream file bytes. `?fmt=docx\|pdf` (default pdf), `?inline=1`. |

See [resume generation](../features/resume-generation.md).

## Career profile / files / skill

| Method / Path | Purpose |
|---|---|
| `GET /api/career-profile` | The user's career markdown + `updatedAt`. |
| `PUT /api/career-profile` | Save career markdown. Body: `content`. |
| `POST /api/career-profile/assist` | AI-fold new details into the markdown (returns proposal). Body: `instruction`. |
| `GET /api/career-files` | List the user's career files. |
| `POST /api/career-files` | Create. Body: `name` (req), `content`. → `{ id }`. |
| `PATCH /api/career-files/[id]` | Update `name`/`content`. |
| `DELETE /api/career-files/[id]` | Delete. |
| `GET /api/resume-skill` | `{ content, isDefault, default, updatedAt }`. |
| `PUT /api/resume-skill` | Save skill (empty reverts to the shipped default). Body: `content`. |

## Interviews

| Method / Path | Purpose |
|---|---|
| `PATCH /api/interviews/[id]` | Update a round. |
| `DELETE /api/interviews/[id]` | Delete a round. |
| `PUT /api/interviews/[id]/transcript` | Set the debrief transcript. JSON `{ transcript }` (pasted) **or** `multipart/form-data` with an audio `file` (transcribed via Whisper, then discarded; needs `OPENAI_API_KEY`). → `{ transcript }`. |
| `POST /api/interviews/[id]/debrief/questions` | Generate + store tailored gap-filling debrief questions. → `{ questions }`. |
| `POST /api/interviews/[id]/debrief` | Body `{ answers }`. Stores answers, synthesizes + stores `summary`/`actionItems`/`sentiment`, logs an `interview` event. → the synthesis. |
| `POST /api/interviews/[id]/prep` | Generate (or regenerate) the AI interview prep pack, persist it, log an `interview_prep` event. → the pack. |
| `PATCH /api/interviews/[id]/prep` | Save hand-edits to the prep pack (validated). → the pack. |

## Calendar

| Method / Path | Purpose |
|---|---|
| `GET /api/calendar` | Aggregate every dated item across the user's applications into a flat event list: scheduled interviews (joined to their application for `company`/`roleTitle`, colored by `outcome`), application deadlines, and next-action dates. No params. → `CalendarEvent[]`. |
| `GET /api/calendar/feed?token=…` | **Public** (token-authed, no session). The same aggregate as an iCalendar (`.ics`) document for calendar subscriptions. Resolves the owning user by `token`; unknown/missing → **404**. → `text/calendar`. |
| `GET /api/calendar/token` | Current subscribable feed URL, or `null` if never enabled. → `{ url }`. |
| `POST /api/calendar/token` | Enable the feed or rotate the token (invalidates the previous URL). → `{ url }`. |

See [calendar](../features/calendar.md).

## Contacts

| Method / Path | Purpose |
|---|---|
| `GET /api/contacts` | List the user's contacts. |
| `POST /api/contacts` | Create. Body: `name` (req), `agency?`, `email?`, `linkedin?`, `notes?`. |

## Analytics

| Method / Path | Purpose |
|---|---|
| `GET /api/analytics` | Aggregate pipeline metrics for the user. |

## Offers

| Method / Path | Purpose |
|---|---|
| `GET /api/offers/comparisons` | List the user's saved offer comparisons (metadata). |
| `POST /api/offers/comparisons` | Compare 2+ owned applications. Body: `applicationIds` (req, ≥2), `priorities?`, `title?`. Builds the deterministic table, feeds attached benefits PDFs to the model, saves + returns `{ id, result: { table, verdict } }`. Logs an `offer_comparison` event per application. |
| `GET /api/offers/comparisons/[id]` | Fetch one saved comparison (snapshotted table + verdict). |
| `DELETE /api/offers/comparisons/[id]` | Delete a saved comparison. |

See [offer comparison](../features/offer-comparison.md).

## Settings

| Method / Path | Purpose |
|---|---|
| `GET /api/settings` | Per-user settings + `hasAnthropicKey`/`hasOpenaiKey`/`keyReadyForProvider`. |
| `PUT /api/settings` | Update settings (partial). |
| `POST /api/settings/test-ntfy` | Send a test ntfy push for the current user. |

See [configuration](../operations/configuration.md).

## Cron

| Method / Path | Auth | Purpose |
|---|---|---|
| `POST /api/cron/reminders` | `x-cron-secret` (if set) | Sweep all users: expire stale applications, then push follow-up reminders. Middleware-exempt. |
| `GET /api/cron/reminders` | user | In-app "needs attention" preview for the current user. |

See [reminders & analytics](../features/reminders-and-analytics.md).

## Related

- [Sessions & middleware](../auth/sessions-and-middleware.md) · [Data model](../architecture/data-model.md) ·
  [Applications & tracking](../features/applications-and-tracking.md) · [Resume generation](../features/resume-generation.md)
