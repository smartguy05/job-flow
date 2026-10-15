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
| `applications.ts` | `listApplications` (lazily runs `expireStaleApplications`), `createApplication` (inline contact, foreign `contactId` ignored), `getApplicationDetail` (resume summaries without blobs, linked `jobId`), `updateApplication` (status events, `appliedAt` backfill, `createJobFromApplication` on `closed_won`), `deleteApplication` | `/api/applications`, `/api/applications/[id]`; MCP `capture_job`, `list_applications`, `get_application`, `update_application` |
| `interviews.ts` | `addInterview` (logs an `interview` event), `updateInterview`, `deleteInterview` | `/api/applications/[id]/interviews`, `/api/interviews/[id]`; MCP `add_interview`, `update_interview` |
| `drafts.ts` | `createDraft(userId, applicationId, { type?, extra? })`: generates via `generateDraft`, stores it and logs a `note` event. Unknown `type` gives `ValidationError`. | `/api/applications/[id]/drafts`; MCP `draft_message` |
| `jobs.ts` | `listJobs` (current first, `tenureMonths`, parsed technologies) | `GET /api/jobs`; MCP `list_jobs` |
| `contacts.ts` | `listContacts`, `createContact`, `findContactByEmail` (trimmed, case-insensitive) | `/api/contacts` |
| `attention.ts` | `candidatesForUser(userId, quietDays)`, `OPEN_STATUSES`, `Candidate` | `/api/cron/reminders` (GET and the sweep); MCP `needs_attention` |
| `journal.ts` | `listJournal(userId, { jobId?, from?, to?, kind? })` (across all jobs when `jobId` is omitted), `addJournalEntry`, `updateJournalEntry` (clears `syncedAt`), `deleteJournalEntry` | `/api/jobs/[id]/journal`, `/api/journal/[id]`; MCP `add_journal_entry`, `list_journal` |
| `resumes.ts` | `getResumeFile(userId, resumeId, "pdf" \| "docx")` → `{ data, filename, contentType }`; `getResumeSummary` (metadata + `hasPdf`/`hasDocx`, no bytes) | `/api/resumes/[id]/download`; MCP `generate_resume` |

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
  [Reminders & analytics](../features/reminders-and-analytics.md) ·
  [Testing](../operations/testing.md)
