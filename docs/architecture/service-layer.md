# Service layer

`src/lib/services/` holds the domain operations that HTTP route handlers and the
[MCP tools](../features/mcp.md) share. A route does auth, parses the request, calls one service function and
shapes the HTTP response. It holds no business logic of its own, so a second entry point
such as MCP reuses the exact same code path.

## Contract

- **`userId` first.** Every function takes the caller's `userId` as its first argument and
  scopes every query by it. Ownership of a parent row (an application, a job) is checked
  before child rows are touched.
- **Plain data.** Functions return plain objects/arrays (or `void`), never a `Response`.
  Bytea blobs are never included in list/detail payloads.
- **Typed errors.** Failures throw `NotFoundError` (missing or not owned, cross-tenant
  included) or `ValidationError` (bad input), from `src/lib/services/errors.ts`.
  `errorResponse(e)` maps them to `{ error }` with `404` / `400` and rethrows anything else,
  which keeps the historical error bodies (`"Not found"`, `"roleTitle is required"`, ...).

## Modules

| Module | Functions | Used by |
|---|---|---|
| `applications.ts` | `listApplications` (lazily runs `expireStaleApplications`), `createApplication` (inline contact, foreign `contactId` ignored), `getApplicationDetail` (resume summaries without blobs, linked `jobId`), `updateApplication` (foreign `contactId` → `ValidationError`, status events, `appliedAt` backfill, `createJobFromApplication` on `closed_won`), `deleteApplication` | `/api/applications`, `/api/applications/[id]`; MCP `capture_job`, `list_applications`, `get_application`, `update_application` |
| `interviews.ts` | `addInterview` (logs an `interview` event), `updateInterview`, `deleteInterview` | `/api/applications/[id]/interviews`, `/api/interviews/[id]`; MCP `add_interview`, `update_interview` |
| `drafts.ts` | `createDraft(userId, applicationId, { type?, extra? })`: generates via `generateDraft`, stores it and logs a `note` event. Unknown `type` gives `ValidationError`. | `/api/applications/[id]/drafts`; MCP `draft_message` |
| `jobs.ts` | `listJobs` (current first, `tenureMonths`, parsed technologies) | `GET /api/jobs`; MCP `list_jobs` |
| `contacts.ts` | `listContacts`, `createContact`, `findContactByEmail` (trimmed, case-insensitive) | `/api/contacts` |
| `attention.ts` | `candidatesForUser(userId, quietDays)`, `OPEN_STATUSES`, `Candidate`; `reviewCandidatesForUser(userId, withinDays = 14)` (current jobs with a not-yet-nudged review in the window), `usersWithUpcomingReviews`, `markReviewReminded` | `/api/cron/reminders` (GET and the sweep); MCP `needs_attention` |
| `career-growth.ts` | `listItems` / `createItem` / `updateItem` / `deleteItem(kind, userId, jobId, …)` for `people`, `oneOnOnes`, `reviews` and `goals` (job must be owned; `personId`/`compensationId` must be on the same job, else `ValidationError`); `getBragDoc(userId, jobId, { from?, to? })` (loads brag-safe columns only); `draftJobSelfReview` (`ValidationError` on an empty brag doc) | `/api/jobs/[id]/{people,one-on-ones,reviews,goals}` (via `src/lib/growth-routes.ts`), `/brag-doc`, `/self-review`; MCP `log_one_on_one`, `add_review`, `update_goal`, `get_brag_doc` |
| `journal.ts` | `listJournal(userId, { jobId?, from?, to?, kind? })` (across all jobs when `jobId` is omitted), `addJournalEntry`, `updateJournalEntry` (clears `syncedAt`), `deleteJournalEntry` | `/api/jobs/[id]/journal`, `/api/journal/[id]`; MCP `add_journal_entry`, `list_journal` |
| `emails.ts` | `ingestEmail` (classify via `classifyEmail`, rank with `rankCandidates`, propose, upsert `ingested_emails`; applies only on `apply` + a confident match), `applyEmailActions` (atomic claim on `applied_at`, runs actions through `updateApplication`/`addInterview`/`logEvent`, releases the claim on failure), `listRecentEmails` | `GET /api/emails`; MCP `ingest_email`, `apply_email_actions` |
| `resumes.ts` | `getResumeFile(userId, resumeId, "pdf" \| "docx")` → `{ data, filename, contentType }`; `getResumeSummary` (metadata + `hasPdf`/`hasDocx`, no bytes); `parseVariantLabel` (trim, ≤80 chars, else `ValidationError`) | `/api/resumes/[id]/download`, `PATCH /api/resumes/[id]`; MCP `generate_resume` |
| `analytics.ts` | `getAnalytics(userId)`: loads projected rows and aggregates them with the pure `computeAnalytics` (`src/lib/analytics.ts`) | `GET /api/analytics`; MCP `get_analytics` |

Existing helpers are reused as they are rather than wrapped: `extractJob`, `findDuplicates`,
`createResumeForApplication`, `generateDraft`, `getOwnedJob`, `jobInput`, `journalInput`,
`logEvent` and `getSettings`.

## Testing

Each module has a `*.test.ts` beside it that calls the functions directly with the seeded
test user's id, including cross-tenant cases built with `seedUser()`. The route tests under
`src/app/api/**` are unchanged and act as the behavior safety net. See
[testing](../operations/testing.md).

## Related

- [Overview](overview.md) · [Data model](data-model.md) · [API reference](../api/reference.md) ·
  [MCP server](../features/mcp.md)
- [Applications & tracking](../features/applications-and-tracking.md) ·
  [Employment history](../features/employment-history.md) ·
  [Career growth](../features/career-growth.md) ·
  [Reminders & analytics](../features/reminders-and-analytics.md) ·
  [Email ingestion](../features/email-ingestion.md) ·
  [Testing](../operations/testing.md)
