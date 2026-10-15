# Data model

Schema is defined in `src/db/schema.ts` (Drizzle `pgTable`s). Migrations are generated
into `drizzle/` — see [database layer](database.md).

## Multi-tenancy

Every domain table has a `userId uuid` foreign key to `users.id` with
`ON DELETE CASCADE`. There is no shared/global data. Enforcement:

- **List/create routes** filter selects by `userId` and set `userId` on inserts.
- **`[id]` routes** filter by `and(eq(table.id, id), eq(table.userId, user.id))` and
  return **404 (not 403)** when a row isn't owned — existence is never leaked.
- Composite indexes `(userId, id)` (top-level) and `(userId, applicationId)` (children)
  keep scoped queries fast.

See [sessions & middleware](../auth/sessions-and-middleware.md) for where `user.id` comes
from, and the [API reference](../api/reference.md) for per-route behavior.

## Tables

| Table | Key | Purpose |
|---|---|---|
| `users` | `id uuid` (PK), `sub` unique | Provisioned on first OIDC login; `sub` is the OIDC subject. `calendar_token` (nullable, unique) is the per-user token for the subscribable calendar feed, minted on first enable. |
| `settings` | `(userId, key)` PK | Per-user key/value (JSON-encoded values). |
| `contacts` | `id` identity | Recruiters/contacts. |
| `applications` | `id` identity | The core record (~40 columns). `status` (`text`) is one of `applied` \| `in_progress` \| `closed_won` \| `closed_lost` \| `expired`; `appliedAt` is the user-settable applied date; `lastActivityAt` drives reminders + auto-expiry. |
| `resumes` | `id` identity | Generated resume versions + file bytes. |
| `interviews` | `id` identity | Interview rounds per application, plus an optional post-interview debrief (`transcript`, `debrief_questions`/`debrief_answers`/`debrief_action_items` as JSON `text`, `debrief_summary`, `debrief_sentiment` JSON, `debrief_at`) and an optional AI **interview prep pack** (`prep_pack_json` — the full pack as JSON `text` — and `prep_generated_at`). Audio is transcribed and discarded — no audio bytes are stored. |
| `application_files` | `id` identity | Binary documents uploaded against an application. `kind` is one of `benefits` \| `resume` \| `cover_letter` \| `message` \| `offer_letter` \| `misc` (defaults to `benefits`). `data bytea`, plus `name`/`mime_type`/`size`. Only `kind = benefits` files are fed to the model as native document blocks during offer comparison — the other kinds are store-and-download only. |
| `offer_comparisons` | `id` identity | Saved offer comparisons. `application_ids` is a JSON `number[]` (not a FK — the snapshot must survive edits/deletes); `result_json` snapshots the deterministic table + AI verdict; optional `title`/`priorities`. |
| `interview_questions` | `id` identity | Questions the user asks interviewers. `application_id` NULL = general (applies to every job); otherwise specific to that application (`ON DELETE CASCADE`). `text`, `sort_order`. Index `(user_id, application_id)`. |
| `application_question_state` | `id` identity | Per-job check state + notes for a question. `application_id` + `question_id` (both `ON DELETE CASCADE`), `checked_at` (null = unchecked), `notes`, `updated_at`. Unique `(application_id, question_id)`; no row = unchecked, no notes. See [interview questions](../features/interview-questions.md). |
| `events` | `id` identity | Activity log (timeline + analytics). `type` is free text; `email` events come from [email ingestion](../features/email-ingestion.md). |
| `message_drafts` | `id` identity | Reply/cover-letter/follow-up drafts. |
| `career_profile` | `userId` PK | One master career-info markdown per user. |
| `career_files` | `id` identity | Supplementary source docs (many per user). |
| `resume_skill` | `userId` PK | Editable generation instructions (falls back to default). |
| `jobs` | `id` identity | Positions held. `application_id` (nullable, `ON DELETE SET NULL`) links a job auto-created from a `closed_won` application; unique `(user_id, application_id)` makes that idempotent. `start_date`/`end_date` are `date` (null end = current); `technologies` is a JSON `string[]`; `profile_synced_at` (null = not yet folded into the career profile). See [employment history](../features/employment-history.md). |
| `job_compensation` | `id` identity | Comp timeline per job (`ON DELETE CASCADE`): `kind` (`start`\|`raise`\|`promotion`\|`adjustment`\|`bonus_payout`\|`equity_grant`), `effective_date`, `base_amount`, `currency`, `period`, `title`, `bonus`, `equity`, `notes`. |
| `job_benefits` | `job_id` PK | One benefits row per job: `health`, `retirement`, `pto_days`, `parental_leave`, `remote_policy`, `other`. |
| `inventions` | `id` identity | Prior inventions / original works of authorship ("Exhibit A"): `title`, `description` (NOT NULL, default `''`), free-text `invention_date`, `identifier`, `kind` (`software`\|`invention`\|`authorship`\|`other`), `technologies` (JSON `string[]`), `include_in_resume` (boolean, default false), private `notes`, `sort_order`. Index `(user_id, sort_order)`. See [prior inventions](../features/prior-inventions.md). |
| `ingested_emails` | `id` identity | Emails handed over through the MCP `ingest_email` tool (see [email ingestion](../features/email-ingestion.md)). `message_id` (provider id), `kind` (`rejection`\|`interview_invite`\|`recruiter_reply`\|`offer`\|`application_ack`\|`other`), `summary`, `from_address`, `subject`, `received_at`, `processed_at`, `applied_at` (null = proposed only), `actions` (JSON of the applied actions), `application_id` (nullable, `ON DELETE SET NULL`). Unique `(user_id, message_id)` makes ingest idempotent; `applied_at` is claimed atomically so a message is applied once. The body is never stored. Index `(user_id, processed_at)`. |
| `journal_entries` | `id` identity | Work journal per job (`ON DELETE CASCADE`): `kind` (`achievement`\|`feedback`\|`complaint`\|`note`), `entry_date`, `title`, `body`, `impact`, `technologies` (JSON `string[]`), `synced_at` (null = pending profile sync). |

Integer PKs use `GENERATED ALWAYS AS IDENTITY`. Timestamps are `timestamptz` with a
JS-side default (`$defaultFn(() => new Date())`).

## Relationships

- `applications.contactId → contacts.id` (`ON DELETE SET NULL`).
- `resumes / interviews / events / message_drafts / application_files . applicationId →
  applications.id` (`ON DELETE CASCADE`) — deleting an application removes its children
  automatically.
- All of the above also carry `userId → users.id` (`ON DELETE CASCADE`).
- `interview_questions.applicationId → applications.id` (nullable, `ON DELETE CASCADE`);
  `application_question_state.applicationId` / `.questionId` cascade from `applications` /
  `interview_questions`.
- `jobs.applicationId → applications.id` (nullable, `ON DELETE SET NULL`) — deleting the
  application keeps the job. `job_compensation` / `job_benefits` / `journal_entries . jobId →
  jobs.id` (`ON DELETE CASCADE`).
- `ingested_emails.applicationId → applications.id` (nullable, `ON DELETE SET NULL`), so the
  record of a processed message (and its idempotency key) survives deleting the application.
- `offer_comparisons` carries only `userId → users.id` (`ON DELETE CASCADE`); it references
  applications by id inside `application_ids`/`result_json` rather than by FK, so a saved
  comparison remains intact if an included application is later changed or deleted.

## File storage (bytea)

Binary files live **in the database**, not on disk:

- `resumes.docxData` / `resumes.pdfData` are `bytea` (a Drizzle `customType` normalizing
  reads to a Node `Buffer`).
- `application_files.data` is `bytea` — user-uploaded files (resumes, cover letters,
  messages, offer letters, misc, or benefits paperwork; see `kind` above). Uploaded via the proven
  `req.formData()` → `file instanceof File` flow (mirroring the transcript route). Only
  `benefits` files are base64-encoded at comparison time and sent to the model as native
  document blocks; the other kinds are stored purely for download.
- `resumes.baseName` holds the descriptive filename stem (e.g.
  `Jane_Doe_Resume_Globex_v2`) used for downloads.
- JSON is stored as `text` and (de)serialized in code: `settings.value`,
  `resumes.contentJson`, `resumes.chatJson`, and the interview debrief fields
  (`interviews.debrief_questions` / `debrief_answers` / `debrief_action_items` /
  `debrief_sentiment`).

Rendering writes to a temp workspace (LibreOffice needs real files), then reads the bytes
back for storage; downloads stream from the column. See
[resume generation](../features/resume-generation.md).

## Changing the schema

Edit `src/db/schema.ts`, then `npx drizzle-kit generate`, and verify the SQL applies on
both pglite and real Postgres (see [database layer](database.md)). Update this file and any
affected feature/API docs in the same change.

## Related

- [Database layer](database.md) · [Email ingestion](../features/email-ingestion.md) · [OIDC flow](../auth/oidc-flow.md) ·
  [Resume generation](../features/resume-generation.md) · [API reference](../api/reference.md)
