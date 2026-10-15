# Career growth (people, 1:1s, reviews, goals, brag doc)

After the hire, JobFlow keeps tracking the job you hold. On top of the comp timeline and work
journal in [employment history](employment-history.md), each job can record:

- **people**: managers, skip-levels, peers, reports, mentors and stakeholders;
- **1:1s**: private meeting notes with action items;
- **performance reviews**: cycle, period, rating, reviewer, summary, strengths, growth areas,
  outcome, and an optional link to the raise or promotion row that came out of it;
- **goals**: title, description, period (e.g. `2026-H2`), status, progress and key results;
- the **next review date**, which shows on the calendar and triggers a reminder.

From that record JobFlow builds a **brag doc** and can draft a **self-review** with the AI.

UI: the **People & 1:1s** and **Reviews & Goals** tabs on `/jobs/[id]`
(`src/app/jobs/[id]/_components/PeopleTab.tsx`, `ReviewsGoalsTab.tsx`). The next review date
is on the **Overview** tab.

Code:
- `src/lib/career-growth.ts`: pure input parsers, checklist JSON, manager history.
- `src/lib/brag-doc.ts`: pure brag-doc builder and its Markdown/DOCX renderers.
- `src/lib/services/career-growth.ts`: user- and job-scoped CRUD, `getBragDoc` and
  `draftJobSelfReview`.
- `src/lib/growth-routes.ts`: the shared route handlers.

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

## Privacy rule

These never reach an LLM prompt or the career-profile sync:

- complaints and notes from the journal;
- 1:1 notes and action items;
- people notes;
- compensation, equity, benefits and PTO;
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

See [MCP server](mcp.md).

## Related

- [Employment history](employment-history.md) (jobs, comp, journal, profile sync)
- [Calendar](calendar.md) · [Reminders & analytics](reminders-and-analytics.md)
- [Data model](../architecture/data-model.md) · [Service layer](../architecture/service-layer.md)
- [API reference](../api/reference.md#career-growth) · [MCP server](mcp.md)
