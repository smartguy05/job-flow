# Employment history

JobFlow tracks the jobs you actually hold, not just the ones you apply to. For each job you can record:
- title changes
- a compensation timeline
- benefits
- a **work journal** of achievements, feedback, complaints and notes, each with the technologies it involved

Over time this becomes your record of what you did, what you were paid, and what you want next time. Resume-safe parts of it are folded back into the career profile, but only when you approve.

Pages: `/jobs` (`src/app/jobs/page.tsx`) and `/jobs/[id]` (`src/app/jobs/[id]/page.tsx`). The job page is split into tabs, each a component under `src/app/jobs/[id]/_components/`:
- **Overview**: job fields, the next review date, the derived current manager and the profile-sync panel;
- **Pay**: the comp timeline, where rows can be added, **edited** and removed, plus benefits;
- **People & 1:1s** and **Reviews & Goals**: see [career growth](career-growth.md);
- **Journal**: entries can be added, **edited** and deleted;
- **Equity**, **PTO** and **Documents**: see [career growth](career-growth.md#equity-grants).

The active tab is kept in the URL hash (for example `/jobs/3#people`), parsed by `jobTabFromHash()` in `src/lib/job-labels.ts`.
Logic lives in `src/lib/jobs.ts`, `src/lib/job-input.ts`, `src/lib/profile-sync.ts`, `src/lib/job-import-content.ts`, `src/lib/text-diff.ts` and `src/lib/job-labels.ts`.

## Where jobs come from

- **Winning an application.** When `PATCH /api/applications/[id]` changes the status to `closed_won`, it calls `createJobFromApplication()`. That creates a job pre-filled from the application:
  - company and title, with `startDate` set to today
  - employment type and location
  - the application's tech stack, as technologies
  - a `start` comp row from `payMax ?? payMin`, with currency, period and bonus
  - `benefits.other`, seeded from the application's benefits text

  A unique index on `(user_id, application_id)` makes this idempotent: moving an application out of and back into `closed_won` never creates a second job. The application detail page then shows a **View job** button, using `jobId` from the GET response.
- **Manually**, with **Add job** on `/jobs`.
- **Backfill import** from the career profile, and from applications that were already `closed_won` before job tracking existed (see below).

## Compensation timeline

`job_compensation` rows have a `kind`: `start`, `raise`, `promotion`, `adjustment`, `bonus_payout` or `equity_grant`. Each row also has an effective date and an optional base amount, plus optional bonus, equity, notes and new title.

`compSummary()` orders the rows by date and returns:
- the % change between successive base-pay rows
- the current base
- total growth since the first base
- the title history (from `title` on start and promotion rows)

## Benefits

`job_benefits` holds one row per job: health, retirement, PTO days, parental leave, remote policy, and free-text "other". It is upserted with `PUT /api/jobs/[id]/benefits`.

## Work journal & technologies

`journal_entries` has a kind (`achievement`, `feedback`, `complaint` or `note`), plus a date, title, body, optional `impact` (a measurable result) and a technologies list. Technologies are stored as a JSON `string[]` on both jobs and entries. The job detail returns the case-insensitive union of the two lists (`mergeTechnologies()`). The API accepts technologies either as an array or as a comma-separated string.

## Profile sync (AI proposes, you approve)

1. `POST /api/jobs/profile-sync` picks jobs.
   - By default it picks every job that is not yet synced (`profile_synced_at` is null) or that has unsynced achievement or feedback entries.
   - Or it takes an explicit `{ jobIds }`.
2. `buildSyncInstruction()` turns those jobs into an instruction containing:
   - title, employer, dates, team
   - title history and technologies
   - unsynced **achievement** and **feedback** entries
3. That instruction goes through the existing `assistCareerProfile()`. The response is `{ current, proposed, entryIds, jobIds }`, and nothing is saved.
4. `ProfileSyncPanel` (`src/components/ProfileSyncPanel.tsx`) shows a line diff (`diffLines()`) and lets you edit the proposal. On **Save** it calls `PUT /api/career-profile`, then `POST /api/journal/mark-synced`.

**Privacy rule:** complaints, notes, compensation, benefits, reason for leaving and job notes are **never** included in the instruction. Neither is anything from [career growth](career-growth.md#privacy-rule) (people notes, 1:1s, reviews, goals, equity, PTO, job documents), so they cannot reach the career profile or a resume. Tests in `src/lib/profile-sync.test.ts` and the route test enforce this.

Editing a job (PATCH) clears its `profile_synced_at`, and editing a journal entry clears its `synced_at`. Either way, the change is offered again in the next sync.

The sync panel appears on each job page (scoped to that job) and on the Career profile page (covering all pending jobs).

## Backfill import

**Import from profile & applications** on `/jobs` builds one preview from two sources:
- **Won applications without a job.** `unlinkedWonApplications()` finds `closed_won` applications with no linked job, such as ones won before job tracking existed. Each is dated by `wonDateFrom()`: the latest `status_change` event into `closed_won`, or the application's `updatedAt` if there is none.
- **Jobs found in the career profile.** `extractJobsFromProfile()` (`src/lib/llm.ts`) reads the profile. Its output is validated by `ImportedJobsSchema`, which normalizes `YYYY` and `YYYY-MM` dates to full dates and turns unknown dates into null. If the profile is empty, the model call is skipped. The preview returns 400 only when there is nothing to import from either source.

Every item carries `match`, computed by `matchExisting()`:
- `"exact"`: same normalized company, start date and title as a tracked job (`jobKey()`).
- `"possible"`: same company, but different dates or title. For example, a job created when you won the application may be dated differently from how your profile lists it.
- `null`: no match.

Profile jobs are also matched against the won applications in the same preview, so one job appearing in both lists gets flagged. Items marked `exact` or `possible` start unchecked.

`POST /api/jobs/import/confirm` takes `{ jobs?, applicationIds? }`:
- **Profile jobs** are created with their achievements as journal entries, all **already synced** (their content came from the profile). Exact duplicates are skipped.
- **Each application id** gets a job through `createJobFromApplication()`, which fills it from the application's pay and benefits and starts it on the won date. Those jobs are *not* marked synced, so the next profile sync offers them. Ids that aren't the caller's, aren't won, or already have a job are skipped.

## Related

- [Career growth](career-growth.md) (people, 1:1s, reviews, goals, brag doc, self-review)
- [Applications & tracking](applications-and-tracking.md)
- [Resume generation](resume-generation.md) (career profile, the never-fabricate rule)
- [Offer comparison](offer-comparison.md)
- [Data model](../architecture/data-model.md)
- [API reference](../api/reference.md)
- [Service layer](../architecture/service-layer.md) (`listJournal` across jobs, journal CRUD)
