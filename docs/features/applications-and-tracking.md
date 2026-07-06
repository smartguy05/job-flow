# Applications & tracking

The core pipeline: capture a posting, dedup-check it, save it, and track it through
interviews, drafts, and a timeline. All data is per-user (see
[data model](../architecture/data-model.md)); all endpoints require auth (see
[API reference](../api/reference.md)).

## Capture (`POST /api/capture`)

Paste a recruiter message / JD / link. `extractJob()` (`src/lib/llm.ts`) uses the user's
LLM provider to extract structured fields (company, role, contact, a clean `jdSnapshot`,
plus pay/location/logistics). **Nothing is persisted** — the endpoint returns the extracted
fields plus a duplicate check for the UI to review, then the UI POSTs to
`/api/applications`.

## Duplicate detection (`src/lib/dedup.ts`)

`findDuplicates(userId, company, roleTitle, windowDays)` flags prior applications by the
same user to the same normalized company and a similar role (Jaccard token similarity ≥
0.4) within the dedup window (default 30 days, a per-user setting). `normalizeCompany` and
`roleSimilarity` are pure and unit-tested.

## Applications (`/api/applications`, `/api/applications/[id]`)

- `GET /api/applications` — list with joined contact and a resume count (counts avoid
  pulling file blobs into memory).
- `POST /api/applications` — create; company is optional (recruiters often withhold it).
  Can auto-create a contact from `contactName`; a supplied `contactId` is validated to
  belong to the user. Logs a `created` event.
- `GET /api/applications/[id]` — full detail: application, contact, resume **summaries**
  (blob columns projected out to `hasDocx`/`hasPdf` booleans), interviews, drafts, events.
- `PATCH` — partial update; a status change logs a `status_change` event and sets
  `appliedAt` when moving off `applied`.
- `DELETE` — scoped to the user; children removed via FK cascade.

Rich detail fields (compensation, location, seniority, tech stack, logistics, personal
ratings) are mapped by `detailFields()` in `src/lib/application-fields.ts`.

## Interviews

- `POST /api/applications/[id]/interviews` — add a round (verifies the application is
  owned first); logs an `interview` event.
- `PATCH` / `DELETE /api/interviews/[id]` — update/remove, scoped by `userId`.

## Message drafts (`POST /api/applications/[id]/drafts`)

`generateDraft()` produces a recruiter reply, cover letter, or follow-up using the user's
career context (see [resume generation](resume-generation.md)) and the target role; the
draft is stored and a `note` event logged.

## Activity timeline (`src/lib/events.ts`)

`logEvent(userId, applicationId, type, detail?)` inserts an `events` row **and** bumps the
application's `lastActivityAt`/`updatedAt`. Event types: `created`, `status_change`,
`resume_generated`, `resume_final`, `resume_sent`, `interview`, `note`, `reminder_sent`.
The timeline powers the detail page and the [reminders & analytics](reminders-and-analytics.md)
features.

## Contacts (`/api/contacts`)

List/create recruiters and agency contacts (per user). Applications reference a contact via
`contactId` (`ON DELETE SET NULL`).

## Related

- [Resume generation](resume-generation.md) · [Reminders & analytics](reminders-and-analytics.md) ·
  [Data model](../architecture/data-model.md) · [API reference](../api/reference.md)
