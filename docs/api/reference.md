# API reference

All endpoints are Next.js App Router route handlers under `src/app/api/**`. Unless noted
**Auth: user**, every request must carry a valid session — the [middleware](../auth/sessions-and-middleware.md)
returns `401` for unauthenticated `/api/*`, and handlers also call `getUser(req)` as
defense-in-depth. All data is scoped to the caller; `[id]` routes return **404** (not 403)
for rows the caller doesn't own (see [data model](../architecture/data-model.md)).

Conventions: request/response bodies are JSON. `[id]` is an integer path segment. Error bodies
are `{ "error": string }`. Applications, interviews, contacts, the work journal, resume
downloads, drafts, the jobs list and the needs-attention list are thin wrappers over the
[service layer](../architecture/service-layer.md).

## Auth

| Method / Path | Auth | Purpose |
|---|---|---|
| `GET /api/auth/login` | public | Start OIDC login; redirect to Authentik. `?returnTo=` (sanitized). |
| `GET /api/auth/callback` | public | OIDC callback; sets session, redirects to `returnTo`. |
| `POST /api/auth/logout` | public | RP-initiated logout; clears session, ends IdP session. |

See [OIDC flow](../auth/oidc-flow.md).

## MCP

| Method / Path | Auth | Purpose |
|---|---|---|
| `POST /api/mcp` | OAuth bearer | MCP Streamable HTTP endpoint (stateless, JSON-RPC in, SSE out). Needs `Authorization: Bearer <Authentik access token>`. Without one, or with a bad or unknown-user token, it returns `401` with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`. Session cookies are ignored. Middleware-exempt. |
| `GET`, `DELETE /api/mcp` | OAuth bearer | `401` challenge without a token, otherwise `405` (`Allow: POST`). There is no standalone stream or session in stateless mode. |
| `GET /.well-known/oauth-protected-resource` | public | RFC 9728 metadata: `resource` (`${APP_BASE_URL}/api/mcp`), `authorization_servers` (`[MCP_OAUTH_ISSUER ?? OIDC_ISSUER]`), `scopes_supported`, `bearer_methods_supported: ["header"]`. Also served at `/.well-known/oauth-protected-resource/api/mcp`. |

See [MCP server](../features/mcp.md) for the tool list and [email ingestion](../features/email-ingestion.md)
for `ingest_email`, `apply_email_actions` and the `triage_job_emails` prompt.

## Applications

| Method / Path | Purpose |
|---|---|
| `GET /api/applications` | List (with contact + resume count). Lazily expires the caller's stale applications first. |
| `POST /api/applications` | Create. Body: `roleTitle` (req), `company?`, `contactId?`/`contactName?`, detail fields, `appliedAt?` (ISO date) or `markApplied?` (today). → `{ id }`. |
| `GET /api/applications/[id]` | Full detail: app, contact, resume summaries (`hasDocx`/`hasPdf`), interviews (incl. prep pack), drafts, events, uploaded `files` (metadata only), and `jobId` (the job created from it, or `null`). |
| `PATCH /api/applications/[id]` | Partial update; accepts `appliedAt` (ISO date, or `null` to clear) and `contactId` (must be one of the user's contacts, else 400; `null` clears); status change logs an event. Changing to `closed_won` auto-creates a job (idempotent). |
| `DELETE /api/applications/[id]` | Delete (children cascade). |
| `PUT /api/applications/[id]/job-description` | Set the job description used for tailoring. Either JSON `{ jdSnapshot }` (paste/amend) or `multipart/form-data` with a `file` (PDF/Word/text, ≤10MB — text extracted server-side). Logs a `jd_updated` event. → `{ jdSnapshot }`. |
| `POST /api/applications/[id]/generate` | Generate a tailored resume version → `{ resumeId }`. 404 if app not owned. |
| `POST /api/applications/[id]/resumes` | Attach a copy of an existing resume as a new draft version. Body: `sourceResumeId` (req). → `{ resumeId }`. 400 if missing, 404 if source/target not owned. |
| `POST /api/applications/[id]/drafts` | Generate + store a draft (`createDraft`). Body: `type` (`reply`\|`cover_letter`\|`follow_up`, default `reply`; anything else is `400`), `extra?`. 404 if the app is not owned. |
| `POST /api/applications/[id]/interviews` | Add an interview round. |
| `GET /api/applications/[id]/files` | List uploaded document metadata (no bytes), including `kind`. |
| `POST /api/applications/[id]/files` | Upload a document. `multipart/form-data` with a `file` and an optional `kind` (`resume`\|`cover_letter`\|`message`\|`offer_letter`\|`misc`\|`benefits`, defaults to `benefits`). `benefits` accepts PDF only; the other kinds accept PDF or DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`). ≤10MB. → file metadata (incl. `kind`). |
| `GET /api/applications/[id]/files/[fileId]` | Stream the file bytes (any `kind`). `?inline=1` to preview. |
| `DELETE /api/applications/[id]/files/[fileId]` | Delete an uploaded document (any `kind`). |

See [applications & tracking](../features/applications-and-tracking.md) and
[offer comparison](../features/offer-comparison.md).

## Capture

| Method / Path | Purpose |
|---|---|
| `POST /api/capture` | Extract structured fields from pasted text + duplicate check. **Persists nothing.** Body: `text` (req), `companyHint?`, `contactHint?`. → `{ extracted, duplicates, dedupWindowDays }`. |

## Resumes

| Method / Path | Purpose |
|---|---|
| `GET /api/resumes` | List the user's resumes across all applications (with owning `company`/`roleTitle`, no file blobs), newest first. Used as the "add existing" source list. |
| `GET /api/resumes/[id]` | Resume metadata + parsed `content` and `chat` (no file blobs). |
| `PATCH /api/resumes/[id]` | Save edited `content` (re-renders), set `status`, `markSent`, or `variantLabel` (string ≤80 chars, trimmed; `""`/`null` clears; `400` otherwise). |
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

## Jobs (employment history)

| Method / Path | Purpose |
|---|---|
| `GET /api/jobs` | List jobs (current first) with `technologies[]` and `tenureMonths`. |
| `POST /api/jobs` | Create. Body: `company`, `title` (req), `startDate?`/`endDate?` (`YYYY-MM-DD`), `team?`, `manager?`, `employmentType?`, `locationMode?`, `location?`, `technologies?` (array or comma string), `reasonForLeaving?`, `notes?`. → `{ id }`. |
| `GET /api/jobs/[id]` | `{ job, compensation, compSummary, benefits, entries, technologies, currentManager, managerHistory }`. `currentManager` is derived from dated `manager` people, falling back to `job.manager`. |
| `PATCH /api/jobs/[id]` | Partial update (same fields, plus `nextReviewDate`); clears `profileSyncedAt` unless only `nextReviewDate` changed. |
| `DELETE /api/jobs/[id]` | Delete (comp, benefits, journal, people, 1:1s, reviews and goals cascade). |
| `GET/POST /api/jobs/[id]/compensation` | List / add a comp row. Body: `kind`, `effectiveDate`, `baseAmount`, `currency`, `period` (`year`\|`hour`), `title`, `bonus`, `equity`, `notes`. |
| `PATCH/DELETE /api/jobs/[id]/compensation/[compId]` | Edit / remove a comp row. |
| `PUT /api/jobs/[id]/benefits` | Upsert benefits: `health`, `retirement`, `ptoDays`, `parentalLeave`, `remotePolicy`, `other`. |
| `GET/POST /api/jobs/[id]/journal` | List / add a journal entry. Body: `title` (req), `kind` (`achievement`\|`feedback`\|`complaint`\|`note`), `entryDate?` (default today), `body?`, `impact?`, `technologies?`. |
| `PATCH/DELETE /api/journal/[id]` | Edit (clears `syncedAt`) / delete an entry. |
| `POST /api/jobs/profile-sync` | AI-proposed career-profile update from pending jobs + achievements/feedback (never complaints, notes, pay or benefits). Body: `jobIds?`. → `{ current, proposed, entryIds, jobIds }`; nothing saved. 400 if nothing pending. |
| `POST /api/journal/mark-synced` | Body: `entryIds[]`, `jobIds?[]` — mark as folded into the profile (call after `PUT /api/career-profile`). |
| `POST /api/jobs/import` | Backfill preview → `{ jobs, applications }`: past jobs extracted from the career profile (model skipped if the profile is empty) and `closed_won` applications without a job (`applicationId`, `company`, `roleTitle`, `wonDate`, `pay`). Each item has `match`: `"exact"` \| `"possible"` \| `null`. Nothing saved. 400 if there is neither a profile nor a won application to import. |
| `POST /api/jobs/import/confirm` | Body: `{ jobs?, applicationIds? }`. Profile jobs → jobs + achievement entries (already synced), skipping exact duplicates; application ids → jobs filled from the application, starting on the won date (others' / non-won / already-linked ids skipped). → `{ created, skipped }`. |

See [employment history](../features/employment-history.md).

## Career growth

All routes are scoped to the user **and** the job in the path. Another user's job, or a row
from a different job, gives 404. Rows are edited at `[subId]` with `PATCH` (partial) and
removed with `DELETE`, and both return `{ ok: true }`. Creates return `{ id }`. See
[career growth](../features/career-growth.md).

| Method / Path | Purpose |
|---|---|
| `GET/POST /api/jobs/[id]/people` | List (managers first) or add a person. Body: `name` (required), `relationship` (`manager`\|`skip`\|`peer`\|`report`\|`mentor`\|`stakeholder`), `title?`, `email?`, `startDate?`, `endDate?`, `notes?`. |
| `PATCH/DELETE /api/jobs/[id]/people/[subId]` | Edit or remove a person. |
| `GET/POST /api/jobs/[id]/one-on-ones` | List (newest first, `actionItems` parsed) or log a 1:1. Body: `date?` (default today), `personId?` (must be on this job, else 400), `notes?`, `actionItems?` (array of strings or `{ text, done }`). |
| `PATCH/DELETE /api/jobs/[id]/one-on-ones/[subId]` | Edit or remove a 1:1. |
| `GET/POST /api/jobs/[id]/reviews` | List (latest period first) or add a review. Body: `cycle` (required), `periodStart?`, `periodEnd?`, `rating?`, `reviewer?`, `summary?`, `strengths?`, `growthAreas?`, `outcome?`, `compensationId?` (a comp row of this job, else 400). |
| `PATCH/DELETE /api/jobs/[id]/reviews/[subId]` | Edit or remove a review. |
| `GET/POST /api/jobs/[id]/goals` | List (active first, `keyResults` parsed) or add a goal. Body: `title` (required), `description?`, `period?`, `status?` (`active`\|`done`\|`dropped`; `done` implies progress 100), `progress?` (0–100), `keyResults?`. |
| `PATCH/DELETE /api/jobs/[id]/goals/[subId]` | Edit or remove a goal. |
| `GET /api/jobs/[id]/brag-doc` | `?from&to` (inclusive `YYYY-MM-DD`), `?fmt=md` (default, `text/markdown`) \| `json` (`{ doc, markdown }`) \| `docx` (attachment). It contains achievements, feedback, review highlights, goals and technologies, and never complaints, notes, 1:1s, pay or review outcomes. A bad `fmt` or date gives 400. |
| `POST /api/jobs/[id]/self-review` | Body `{ from?, to?, cycle? }`. An AI self-review drafted from the brag doc only. Returns `{ draft, bragDoc }`; nothing is saved. Returns 400 when the brag doc is empty and 500 when the model fails. |

## Inventions (Exhibit A)

| Method / Path | Purpose |
|---|---|
| `GET /api/inventions` | List entries in display order, with `technologies[]`. |
| `POST /api/inventions` | Create one entry (object → `{ id }`) or many (array, max 200 → `{ ids }`), appended after the last. Fields: `title` (req), `description`, `inventionDate`, `identifier`, `kind` (`software`\|`invention`\|`authorship`\|`other`), `technologies` (array or comma string), `includeInResume` (boolean), `notes`, `sortOrder`. |
| `PATCH/DELETE /api/inventions/[id]` | Edit (same fields) / delete. |
| `POST /api/inventions/draft` | AI-draft one entry for review. Body: `{ text }` or `{ url }` (public github.com repo only; 400 with guidance otherwise). → `{ draft }`; nothing saved. |
| `POST /api/inventions/suggest` | AI suggestions mined from profile, career files, jobs and journal (no complaints), excluding listed titles. → `{ suggestions: [...{ source, ownershipCaution }] }`. 400 if there is no history. |
| `POST /api/inventions/import` | Parse an existing Exhibit A: `multipart/form-data` `file` (PDF/Word/text, ≤10MB) or JSON `{ text }`. → `{ inventions: [...{ duplicate }] }`; nothing saved. |
| `GET /api/inventions/export` | `?fmt=text\|docx\|pdf` (default pdf), optional `ids=1,2`. Renders on demand; notes are never included. |

See [prior inventions](../features/prior-inventions.md).

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

## Interview questions

All routes are scoped to the caller; unowned rows return **404**. Errors are `{ error }`.

| Method / Path | Purpose |
|---|---|
| `GET /api/questions` | List general questions (no application), ordered by `sortOrder`, `id`. → `{ questions: [{ id, text, sortOrder }] }`. |
| `POST /api/questions` | Add a general question. Body: `text` (req, trimmed, ≤1000 chars). `sortOrder` = max general + 1. → `201 { id, text, sortOrder }`; 400 on bad text. |
| `PATCH /api/questions/[id]` | Edit any owned question (general or job-specific). Body: `text?`, `sortOrder?` (integer). → `{ id, text, sortOrder }`; 400 on bad input. |
| `DELETE /api/questions/[id]` | Delete an owned question (state rows cascade). → `{ ok: true }`. |
| `GET /api/applications/[id]/questions` | The job's checklist. → `{ application: { id, company, roleTitle }, items, prepPacks }`. `items` are `{ id, text, source: "general"\|"job", checked, checkedAt, notes }`, unchecked first then checked by check time. `prepPacks` are `{ interviewId, round, scheduledAt, count }` for interviews whose prep pack has questions to ask. |
| `POST /api/applications/[id]/questions` | Add a job-specific question. Body: `text` (req). → `201 { id, text, sortOrder }`. |
| `DELETE /api/applications/[id]/questions` | Reset: clear all checks for this job, keep notes. → `{ ok: true }`. |
| `PUT /api/applications/[id]/questions/[questionId]` | Upsert check/notes for one question on this job. Body: `checked?` (boolean), `notes?` (string). 404 if the question is neither general nor on this application; 400 on wrong types. → `{ item }`. |
| `POST /api/applications/[id]/questions/import` | Copy an interview's prep-pack `questionsToAsk` into job-specific questions, skipping case-insensitive duplicates of existing job and general questions. Body: `interviewId` (req). 400 if no prep pack; 404 if the interview isn't on this application. → `{ added }`. |

See [interview questions](../features/interview-questions.md).

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

## Emails

| Method / Path | Purpose |
|---|---|
| `GET /api/emails` | The user's recently processed emails (from the MCP `ingest_email` tool), newest first. `?limit=` (default 10, max 100). Each row: `id`, `messageId`, `kind`, `summary`, `fromAddress`, `subject`, `receivedAt`, `processedAt`, `appliedAt` (null = proposed only), `applicationId`, `company`, `roleTitle`. Ingesting and applying happen only over MCP. |

See [email ingestion](../features/email-ingestion.md).

## Analytics

| Method / Path | Purpose |
|---|---|
| `GET /api/analytics` | Outcome analytics for the user. Original fields: `total`, `byStatus`, `responseRate`, `interviewRate`, `closedWon`, `closedLost`, `interviewsScheduled`, `resumesGenerated`, `resumesSent`, `byMonth` (keyed on `appliedAt ?? createdAt`), `avgBasePay`, `countsBySource`. Added: `funnel` (`overall` + `bySource[]`: `applied`/`responded`/`interviewed`/`offer` with `responseRate`/`interviewConversion`/`offerConversion`), `timeToFirstResponse` (`n`, `medianDays`, `p75Days`), and rate buckets `byResumeVariant`, `bySeniority`, `byLocationMode`, `byInterest` (`{ key, n, responded, rate }`). Every bucket carries `smallSample` (n < 5). Also exposed as the MCP `get_analytics` tool. |

See [reminders & analytics](../features/reminders-and-analytics.md#outcome-analytics-get-apianalytics).

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
| `POST /api/cron/reminders` | `x-cron-secret` (if set) | Sweep all users: expire stale applications, push follow-up reminders, and nudge once about each performance review due within 14 days. Middleware-exempt. → `{ candidates, notificationsSent, expired, reviewReminders }`. |
| `GET /api/cron/reminders` | user | In-app "needs attention" preview for the current user. |

See [reminders & analytics](../features/reminders-and-analytics.md).

## Related

- [Sessions & middleware](../auth/sessions-and-middleware.md) · [Data model](../architecture/data-model.md) ·
  [Applications & tracking](../features/applications-and-tracking.md) · [Interview questions](../features/interview-questions.md) · [Resume generation](../features/resume-generation.md) ·
  [Service layer](../architecture/service-layer.md) · [MCP server](../features/mcp.md) · [Email ingestion](../features/email-ingestion.md) ·
  [Career growth](../features/career-growth.md)
