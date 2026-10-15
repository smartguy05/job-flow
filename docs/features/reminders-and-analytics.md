# Reminders & analytics

Two read-mostly features built on the application data and the activity log (see
[applications & tracking](applications-and-tracking.md)).

## Follow-up reminders (`/api/cron/reminders`)

A background sweep that pushes an [ntfy](https://ntfy.sh) nudge for open applications that
need attention.

### Trigger & auth

- `POST /api/cron/reminders` is **machine-to-machine**. It is guarded by the
  `x-cron-secret` header when `CRON_SECRET` is set, and is **exempt from the auth
  middleware** (see [sessions & middleware](../auth/sessions-and-middleware.md)). The
  Compose `reminders` sidecar calls it hourly.
- `GET /api/cron/reminders` is the in-app "needs attention" preview. Because the path is
  middleware-exempt, the handler **self-guards** with `getUser(req)` and scopes to that
  user.

### Multi-user sweep

The POST has no user session, so it iterates **every user** with open applications and uses
each owner's own settings:

1. Collect distinct `userId`s from open (`applied`/`in_progress`) applications.
2. Per user, expire stale applications first (see below), then
   `candidatesForUser(userId, reminderQuietDays)` (`src/lib/services/attention.ts`) finds:
   - **quiet** — `lastActivityAt` older than the user's quiet window (default 7 days) and
     not reminded within that window; and
   - **next_action_due** — `nextActionDate` in the past.
3. For each candidate, `sendNtfy(userId, …)` posts to that user's ntfy topic and sets
   `lastRemindedAt`. The `reminder_sent` event is recorded **without** bumping
   `lastActivityAt` — a system nudge is not user activity, so it must not reset the
   inactivity clock that drives expiry (below).

### Performance review reminders

The same sweep also covers users with a **current** job (no `endDate`) whose
`nextReviewDate` falls between today and 14 days from now (`REVIEW_REMINDER_DAYS`). Those
users are included even if they have no open applications.

- `reviewCandidatesForUser(userId)` returns the jobs whose `reviewRemindedFor` differs from
  their `nextReviewDate`.
- Each gets one ntfy push ("Review coming up: …", linking to `/jobs/[id]`), and
  `markReviewReminded` then stores the date in `reviewRemindedFor`.
- Each review date is therefore nudged once, and moving the review date re-arms the reminder.
- The POST response adds `reviewReminders`, the number of nudges sent. The GET preview is
  unchanged.

See [career growth](career-growth.md).

Quiet-window and ntfy settings are per-user (see [configuration](../operations/configuration.md)
for how settings vs. secrets are split).

## Auto-expiry (`src/lib/expiry.ts`)

`expireStaleApplications(userId, days)` moves a user's open (`applied`/`in_progress`)
applications to the terminal **`expired`** status once `lastActivityAt` is older than
`expireApplicationsAfterDays` (default 30; `0` disables). It updates `status` and inserts an
`expired` event **without** bumping `lastActivityAt`, so the list keeps showing the true
last-active date. Expired applications drop out of the reminder sweep and "needs attention"
view automatically (both filter to open statuses), and the user can revive one by changing
its status back via the detail page.

The sweep runs in two places so it works with or without the external cron:

- the reminder **cron POST** runs it per user before the reminder loop; and
- the applications **list `GET /api/applications`** runs it lazily for the current user, so
  the dashboard reflects expiry immediately on load.

## Notifications (`src/lib/ntfy.ts`)

`sendNtfy(userId, { title, message, tags?, click? })` reads the user's `ntfyUrl` /
`ntfyEnabled` settings and POSTs to the topic; no-ops when disabled. The `click` deep-link
uses `APP_BASE_URL`. `POST /api/settings/test-ntfy` sends a test push for the current user.

## Outcome analytics (`GET /api/analytics`)

What gets responses, and how fast. The route is a thin wrapper: `getAnalytics(userId)`
(`src/lib/services/analytics.ts`) loads the user's applications, interviews, resumes and
response-relevant events (projected columns only — never file blobs; every query filtered
by `userId`), and the pure `computeAnalytics()` (`src/lib/analytics.ts`) aggregates them.
The MCP [`get_analytics`](mcp.md) tool returns the same object.

**What counts as a response.** An application has *responded* when its status moved past
`applied` (not to `expired` — a dead application never progressed), it has an interview, or
it logged a response event: a `status_change` (except into `applied`/`expired`), an
`interview`, or an `email` event other than an automated application acknowledgement (see
[email ingestion](email-ingestion.md)). An *offer* is `closed_won` or an ingested offer email.

**Original fields** (shape unchanged): total, counts by status, response rate, interview
rate, closed won/lost, interviews scheduled, resumes generated/sent, applications per month,
average base pay (range midpoints), counts by source channel. `byMonth` buckets by
`appliedAt`, falling back to `createdAt` for never-applied captures.

**Added metrics:**

- **Funnel by source channel** (`funnel.overall`, `funnel.bySource[]`, missing source →
  `unknown`): applied → responded → interviewed → offer, with step conversions
  `responseRate` (responded/applied), `interviewConversion` (interviewed/responded) and
  `offerConversion` (offer/interviewed); `null` when the denominator is 0.
- **Time to first response** (`timeToFirstResponse`): median and p75 days (linear
  interpolation, 1 decimal) from `appliedAt` to the first response event at or after it.
  Applications without `appliedAt` or without a response are excluded; `n` is the count used.
- **Response rate by resume variant** (`byResumeVariant`): grouped on the most recently
  *sent* resume (`sentAt` set) per application and its `variantLabel`, with the buckets
  `unlabeled` (sent, no label) and `no resume sent`. Labels are set via
  `PATCH /api/resumes/[id]` or the variant-label box on the application's resume list.
- **Response rate by** seniority, location mode (missing → `unspecified`) and interest
  rating (`5`…`1`, then `unrated`).
- **Small-sample flag:** every funnel row, rate bucket and the time-to-response block has
  `smallSample: true` when n < 5 (`SMALL_SAMPLE`).

**UI** (`src/app/analytics/page.tsx`): stat tiles (now including median/p75 time to
response), a funnel with a per-source table, and four response-rate bar charts on a fixed
0–100% scale. Small-sample buckets are drawn as hollow bars and labelled "⚠ small n";
hovering a row shows the exact counts.

## Related

- [Career growth](career-growth.md) (review dates and the brag doc)
- [Applications & tracking](applications-and-tracking.md) · [API reference](../api/reference.md) ·
  [Configuration](../operations/configuration.md) · [Deployment](../operations/deployment.md) ·
  [Service layer](../architecture/service-layer.md) · [MCP server](mcp.md) ·
  [Email ingestion](email-ingestion.md) · [Resume generation](resume-generation.md) ·
  [Data model](../architecture/data-model.md)
