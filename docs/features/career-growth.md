# Career growth (people, 1:1s, reviews, goals, brag doc, equity, PTO, documents)

After the hire, JobFlow keeps tracking the job you hold. On top of the comp timeline and work
journal in [employment history](employment-history.md), each job can record:

- **people**: managers, skip-levels, peers, reports, mentors and stakeholders;
- **1:1s**: private meeting notes with action items;
- **performance reviews**: cycle, period, rating, reviewer, summary, strengths, growth areas,
  outcome, and an optional link to the raise or promotion row that came out of it;
- **goals**: title, description, period (e.g. `2026-H2`), status, progress and key results;
- the **next review date**, which shows on the calendar and triggers a reminder;
- **equity grants** with a computed vesting schedule (the next vest shows on the calendar);
- **PTO** with a yearly balance against the benefits allowance;
- **documents**: offer letter, handbook, contract, reviews and misc files.

From that record JobFlow builds a **brag doc** and can draft a **self-review** with the AI.

UI: the **People & 1:1s**, **Reviews & Goals**, **Equity**, **PTO** and **Documents** tabs on
`/jobs/[id]` (`src/app/jobs/[id]/_components/PeopleTab.tsx`, `ReviewsGoalsTab.tsx`,
`EquityTab.tsx`, `PtoTab.tsx`, `DocumentsTab.tsx`). The next review date is on the
**Overview** tab.

Code:
- `src/lib/career-growth.ts`: pure input parsers, checklist JSON, manager history.
- `src/lib/brag-doc.ts`: pure brag-doc builder and its Markdown/DOCX renderers.
- `src/lib/services/career-growth.ts`: user- and job-scoped CRUD, `getBragDoc` and
  `draftJobSelfReview`.
- `src/lib/growth-routes.ts`: the shared route handlers.
- `src/lib/vesting.ts`, `src/lib/pto.ts`, `src/lib/job-files.ts`: pure vesting math, PTO
  balance, and document upload rules.
- `src/lib/services/job-files.ts`: user- and job-scoped document storage.

## People and manager history

`job_people` rows have a `relationship`: `manager`, `skip`, `peer`, `report`, `mentor` or
`stakeholder`. Each row also has a title, email, optional `startDate`/`endDate` and private
notes.

**Manager history** is simply the `manager` rows in date order (`managerHistory()`).
**The current manager** is derived (`currentManager()`): the latest-starting manager row whose
date range covers today, where an open end or an undated row counts as current. If there is no
such row, it falls back to the free-text `jobs.manager`, which is kept so older records keep
working. `GET /api/jobs/[id]` returns both `currentManager` and `managerHistory`.

## 1:1s

`one_on_ones` rows have a date (default today), an optional `personId`, `notes` and
`actionItems`. Action items are stored as a JSON `{ text, done }[]`. The API accepts an
array of strings or objects, or newline-separated text. In the UI each item is a checkbox, and
the edit box uses one line per item, with `[x]` marking it done.

A `personId` must be a person on the **same job and user**, or the request gets a 400. If the
person is later deleted, the 1:1 is kept and `personId` becomes null.

## Performance reviews

`performance_reviews` holds `cycle` (required), `periodStart`/`periodEnd`, `rating`,
`reviewer`, `summary`, `strengths`, `growthAreas`, `outcome`, and an optional
`compensationId`. Like `personId`, `compensationId` must point at a comp row of the same job
and user. `outcome` and the comp link are private.

## Goals

`goals` have a `status` (`active`, `done` or `dropped`), `progress` from 0 to 100, and
`keyResults` (the same `{ text, done }[]` shape as action items). Setting `status: "done"`
without a progress value sets progress to 100. Lists show active goals first.

## Next review date

`jobs.next_review_date` is set on the Overview tab or with `PATCH /api/jobs/[id]`. Changing
only this field does **not** clear the job's profile-sync state, because it is not a resume
fact.

- **Calendar.** Each job with a next review date adds an all-day `review` event linking to
  `/jobs/[id]` (see [calendar](calendar.md)).
- **Reminder.** The cron sweep nudges once per review date, 14 days ahead or less (see
  [reminders](reminders-and-analytics.md#performance-review-reminders)).

## Brag doc

`buildBragDoc({ job, entries, goals, reviews, from?, to? })` is pure. It returns these
sections:

- **Achievements**: `achievement` journal entries, with their details, impact and
  technologies.
- **Feedback received**: `feedback` journal entries, plus each review's rating, summary,
  strengths and growth areas.
- **Goals completed** (with key results) and **Goals in progress** (with progress).
- **Technologies**: the job's technologies merged with those of the achievements.

`from` and `to` are inclusive `YYYY-MM-DD` dates. They filter entries by `entryDate` and
reviews by `periodEnd` (or `periodStart` if there is no end). Undated items are left out when
a range is given. `bragDocMarkdown()` and `bragDocDocx()` (using the `docx` package) render
the same sections.

`GET /api/jobs/[id]/brag-doc?from&to&fmt=md|json|docx` renders it on demand. Nothing is
stored.

## Self-review draft

`POST /api/jobs/[id]/self-review` with `{ from?, to?, cycle? }` builds the brag doc and sends
**only its Markdown** to `draftSelfReview()` in `src/lib/llm.ts`. The prompt tells the model to
use only the facts in the brag doc and not invent achievements, metrics, scope, dates, names
or technologies. This is the same never-fabricate rule as the
[profile sync](employment-history.md#profile-sync-ai-proposes-you-approve).

The response is `{ draft, bragDoc }`, and nothing is saved. If the brag doc has no
achievements, feedback or completed goals, the route returns 400 and the model is not called.

## Equity grants

`equity_grants` rows have a `type` (`RSU`, `ISO`, `NSO`, `ESPP` or `other`), `grantDate`,
`shares` (required, > 0), `strikePrice` for options, `vestStart` (blank = grant date),
`cliffMonths` (default 12), `vestMonths` (default 48), `frequency` (`monthly`, `quarterly` or
`annual`) and private `notes`. A cliff longer than the vesting period is rejected; on update
that check runs against the stored row.

The schedule is never stored. `src/lib/vesting.ts` derives it:

- `vestingSchedule(grant)`: vest dates every 1, 3 or 12 months from the vest start, through
  `vestMonths`. Nothing vests before the cliff. On the cliff date, everything accrued so far
  vests at once, even when the cliff is off the frequency grid. If the period isn't a
  multiple of the frequency, a final vest lands on the last month.
- Shares are whole: cumulative = `floor(shares × months / vestMonths)`, and the last vest
  takes the remainder, so the schedule always sums to `shares`. Steps where no whole share
  vests are skipped.
- `addMonths` clamps to month ends (Jan 31 + 1 month = Feb 28/29) and always counts from the
  start date, so month-end grants stay on month ends.
- `vestMonths: 0` vests everything at the start (e.g. ESPP purchases).
- `vestedAsOf(grant, date)` counts a vest on that date; `nextVest(grant, date)` is the first
  vest strictly after it. `equityGrantSummary` and `equityTotals` build on these.

All of this is table-tested in `src/lib/vesting.test.ts` (cliff edges, each frequency,
off-grid cliffs, rounding, month ends, the end of vesting).

The list route returns each grant with `vesting` (as of today) and its `schedule`;
`GET /api/jobs/[id]/equity/summary?asOf=` and the MCP `get_equity_summary` tool return
totals and the soonest next vest. **Calendar:** each grant still vesting adds a `vest` event
on its next vest date (see [calendar](calendar.md)).

## PTO

`pto_entries` rows have `startDate` (required), `endDate` (defaults to the start), `days`,
`kind` (`vacation`, `sick`, `holiday` or `other`) and a private `note`. When `days` is not
sent, it is the weekdays in the range (`businessDays()`; public holidays aren't known, so pass
`days` to override, e.g. `0.5`). Changing the dates on an update recounts the days unless
`days` is sent too.

`ptoBalance(allowanceDays, entries, year)` in `src/lib/pto.ts` is pure. The allowance is
`job_benefits.pto_days` (set on the Pay tab). **Vacation and other** count against it; sick
days and holidays are totalled in `byKind` but not deducted. An entry belongs to the year it
starts in. `remaining` can go negative, and is null when there is no allowance.
`GET /api/jobs/[id]/pto/summary?year=` returns it; the **PTO** tab has a year picker.

## Documents

`job_files` mirrors `application_files`: PDF or DOCX up to 10MB, stored as `bytea`, with a
`kind` of `offer_letter`, `handbook`, `contract`, `review` or `misc` (default). Validation
lives in `validateJobUpload()`. Lists return metadata only; the bytes are served only by the
download route, with a sanitized `Content-Disposition` (`contentDisposition()`) and
`X-Content-Type-Options: nosniff`. These files are **store-and-download only**: they are
never parsed or sent to the LLM.

## Privacy rule

These never reach an LLM prompt or the career-profile sync:

- complaints and notes from the journal;
- 1:1 notes and action items;
- people notes;
- compensation, equity grants, benefits and PTO entries;
- job documents (`job_files`);
- review outcomes and comp links;
- job notes and reason for leaving.

`getBragDoc` enforces this at the query level. It selects only `achievement`/`feedback` entries
and only the review columns it renders, so private data is never loaded. Tests enforce the
rule:

- `src/lib/brag-doc.test.ts`;
- `src/lib/services/career-growth.test.ts`, which seeds every private field and asserts none
  of it appears in the LLM call;
- `src/app/api/jobs/[id]/growth-routes.test.ts`;
- `src/app/api/jobs/profile-sync/route.test.ts`, which checks that the new tables never reach
  the sync.

Equity, PTO and document rows are seeded into those last two tests too. The MCP tools
`log_pto` and `get_equity_summary` return the user's own data to their own Claude session on
request, which is different from JobFlow sending it into one of its prompts; even so,
`get_equity_summary` leaves out grant notes.

## Tenancy

Every query filters on both `userId` and the `jobId` from the path, and the job must be owned.
So an id belonging to another user, or to another of the caller's own jobs, gets a 404.
Cross-tenant cases are covered in the service, route and MCP tests.

## MCP tools

| Tool | What it does |
|---|---|
| `log_one_on_one` | `{ jobId, date?, personId?, notes?, actionItems? }` |
| `add_review` | `{ jobId, cycle, periodStart?, periodEnd?, rating?, reviewer?, summary?, strengths?, growthAreas?, outcome? }` |
| `update_goal` | With `goalId`, updates that goal. Without it, creates a goal and needs `title`. Other fields: `title?, description?, period?, status?, progress?, keyResults?`. |
| `get_brag_doc` | `{ jobId, from?, to? }`. Returns `{ doc, markdown }`. |
| `log_pto` | `{ jobId, startDate, endDate?, days?, kind?, note? }`. Returns the entry and that year's balance. |
| `get_equity_summary` | `{ jobId?, asOf? }`. Per-grant and total vested/unvested shares and the next vest, across all jobs or one. |

See [MCP server](mcp.md).

## Related

- [Employment history](employment-history.md) (jobs, comp, journal, profile sync)
- [Calendar](calendar.md) (review and vest events) · [Reminders & analytics](reminders-and-analytics.md)
- [Data model](../architecture/data-model.md) · [Service layer](../architecture/service-layer.md)
- [API reference](../api/reference.md#career-growth) · [MCP server](mcp.md)
