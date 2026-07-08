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
   `candidatesForUser(userId, reminderQuietDays)` finds:
   - **quiet** — `lastActivityAt` older than the user's quiet window (default 7 days) and
     not reminded within that window; and
   - **next_action_due** — `nextActionDate` in the past.
3. For each candidate, `sendNtfy(userId, …)` posts to that user's ntfy topic and sets
   `lastRemindedAt`. The `reminder_sent` event is recorded **without** bumping
   `lastActivityAt` — a system nudge is not user activity, so it must not reset the
   inactivity clock that drives expiry (below).

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

## Analytics (`GET /api/analytics`)

Aggregates the signed-in user's applications into: total, counts by status, response rate,
interview rate, closed won/lost, interviews scheduled, resumes generated/sent, applications
per month, average base pay (range midpoints), and counts by source channel. Queries
project only the columns needed (no file blobs). `expired` applications are excluded from
the "responded" count (a dead application never progressed).

## Related

- [Applications & tracking](applications-and-tracking.md) · [API reference](../api/reference.md) ·
  [Configuration](../operations/configuration.md) · [Deployment](../operations/deployment.md)
