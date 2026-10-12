# Interview question checklist

A checklist of questions the user wants to **ask interviewers**, usable on a phone during a
call. Questions are either *general* (apply to every job) or *job-specific* (belong to one
application). Each job shows the superset, with check marks and answer notes stored per job.

## Concepts

- **General questions** — `interview_questions.application_id IS NULL`. Managed on the
  top-level **Questions** page (`src/app/questions/page.tsx`, "Questions" nav link): add,
  edit, delete, reorder via `sortOrder`.
- **Job-specific questions** — `application_id` set. Added from the job's checklist page or
  imported from a prep pack; edited/deleted through the same `/api/questions/[id]` routes.
- **Per-job state** — `application_question_state`, one row per (application, question),
  unique on both. It holds `checked_at` (null = unchecked) and `notes`. An absent row means
  unchecked with no notes. Because state is keyed by application, checking a general question
  in job A does not affect job B. See the [data model](../architecture/data-model.md).

## Checklist page

The job detail page (`src/app/applications/[id]/page.tsx`) has a **Questions** button that
opens `/applications/[id]/questions`, a full-screen, phone-friendly checklist.

- Checking an item strikes it through and moves it to the bottom of the list.
- Each item has a notes field to capture the interviewer's answer.
- **Reset checks** clears every check for the job but keeps the notes.
- **Import from prep pack** lists the job's interviews that have a prep pack with questions
  to ask (the `prepPacks` array) and copies one pack's `questionsToAsk` into job-specific
  questions. See [interview prep](interview-prep.md).

## Ordering and logic

Pure logic lives in `src/lib/interview-questions.ts` (no db imports, unit-tested):

- `buildChecklist(general, specific, states)` — unchecked items first (general, then
  job-specific, each by `sortOrder` then `id`), followed by checked items ordered by check
  time ascending. Each item is `{ id, text, source: "general" | "job", checked, checkedAt, notes }`.
- `normalizeQuestion(text)` — trims; returns `null` for non-strings, empty text, or text over
  1000 characters (routes answer `400`).
- `dedupeImports(existing, incoming)` — drops incoming questions that match an existing one
  case-insensitively (after trimming), and duplicates within the incoming list.

## Behavior notes

- Checking sets `checked_at` to now (an already-checked item keeps its original time, so its
  position is stable); unchecking sets it to null. Every write bumps `updated_at`.
- Import dedupes against both this job's questions and the general questions, then appends
  with increasing `sortOrder`; the response reports how many were `added`.
- Deleting a question or an application cascades to its state rows.
- All queries are scoped by `userId`; unowned ids return 404. A state write is rejected (404)
  unless the question is general or belongs to that application.

## API

Routes live under `src/app/api/questions/**` and
`src/app/api/applications/[id]/questions/**`; see the
[API reference](../api/reference.md#interview-questions).

## Related

- [Interview prep](interview-prep.md) · [Applications & tracking](applications-and-tracking.md) ·
  [Mobile & PWA](mobile-and-pwa.md) · [Data model](../architecture/data-model.md) ·
  [API reference](../api/reference.md)
