# Calendar

A single timeline of everything dated across all of a user's applications, so scheduled and
past interviews are visible in one place rather than one application at a time. The page lives
at `/calendar` (linked from the top nav in `src/app/layout.tsx`).

## What it shows

Three event types, aggregated from existing tables — no new schema:

| Type | Source | Title | Color |
|---|---|---|---|
| `interview` | `interviews.scheduledAt` (non-null), joined to `applications` for company/role | `interviews.round` (fallback "Interview") | by `outcome`: blue = pending, green = passed, red = failed, slate = cancelled |
| `deadline` | `applications.applicationDeadline` | "Application deadline" | red |
| `next_action` | `applications.nextActionDate` | `applications.nextAction` (fallback "Next action") | amber |

Interviews with no `scheduledAt` are omitted (they have no place on a calendar).

## Layout

- **Month grid** (`src/app/calendar/page.tsx`) — 6×7 Monday-start grid with prev/next month
  navigation and a "Today" button. Each cell shows the day number (today highlighted), up to
  two event chips colored by type/outcome, and a `+N more` overflow. Days outside the current
  month are dimmed. Clicking a cell selects that day.
- **Agenda** — below the grid, the selected day's events (or, when that day is empty, the next
  10 upcoming events). Each row links to `/applications/[id]`, where interviews are managed.
- **Legend** — maps colors to the three event types.

The view is **read-only**: there is no scheduling/editing UI on the calendar. Interviews are
created and edited on the [application detail page](applications-and-tracking.md) via the
`interviews` endpoints.

## Subscribable feed (`.ics`)

The same three event types are also exposed as an iCalendar feed that can be subscribed to
from Google, Apple, or Outlook Calendar, kept in sync as applications change.

- **Opt-in, per-user token.** External calendar clients cannot perform the Authentik OIDC
  login, so the feed authenticates with an unguessable per-user token stored in
  `users.calendar_token` (nullable — minted on first enable). The feed route
  `GET /api/calendar/feed?token=…` is exempted from the session middleware
  (`PUBLIC_PREFIXES` in `src/middleware.ts`) and self-guards on the token, mirroring the
  `/api/cron` convention. An unknown/missing token returns **404** (a bad token is
  indistinguishable from a missing resource).
- **Enable / rotate.** Managed from **Settings → Calendar feed**, backed by the
  session-guarded `GET`/`POST /api/calendar/token` (deliberately *outside* the public
  `/api/calendar/feed` prefix, and kept off the settings `PUT` so the token can't leak
  through it). `POST` mints a fresh token, invalidating any previous subscription URL.
- **Event styling.** Interviews are **timed** events (UTC `DTSTART`); deadlines and
  next-actions are **all-day** (`DTSTART;VALUE=DATE`). No `VALARM` — reminders are handled
  by ntfy push (see [reminders](reminders-and-analytics.md)). Each `VEVENT` has a stable
  `UID` (`{type}-{interviewId|applicationId}@jobflow`) so clients update in place instead
  of duplicating, plus a `URL` back to the application. The absolute feed/event URLs use
  `APP_BASE_URL`.

## Code map

- `src/lib/calendar.ts` — pure, DB-free, React-free helpers (unit-tested in
  `calendar.test.ts`): the `CalendarEvent` type, `buildMonthGrid(year, monthIndex)`,
  `dayKey` (local `YYYY-MM-DD`), `eventsByDay` (grouping), `eventColor`,
  `EVENT_TYPE_LABELS`, and the iCalendar serializers (`toICS`, `escapeICSText`,
  `formatICSDate`, `foldICSLine`, `eventUID`).
- `src/lib/calendar-data.ts` — DB-backed helpers shared by the JSON route and the feed:
  `getCalendarEvents(userId)` (the three parallel `userId`-scoped queries) plus the feed
  token helpers (`getOrCreateCalendarToken`, `regenerateCalendarToken`,
  `findUserIdByCalendarToken`).
- `src/app/api/calendar/route.ts` — `GET /api/calendar`; auth-scoped, returns the merged
  `CalendarEvent[]` with dates as ISO strings. See the [API reference](../api/reference.md#calendar).
- `src/app/api/calendar/feed/route.ts` — `GET /api/calendar/feed?token=…`; public,
  token-authed, returns `text/calendar`.
- `src/app/api/calendar/token/route.ts` — `GET`/`POST /api/calendar/token`; session-guarded
  feed-URL reporting and token rotation.
- `src/app/calendar/page.tsx` — client page; fetches once via `api()` and does all month
  navigation/grouping client-side (personal-scale volume, matching the dashboard).
- `src/app/settings/page.tsx` — the "Calendar feed" section (enable, copy, regenerate).

## Related

- [Applications & tracking](applications-and-tracking.md) — where interviews, deadlines, and
  next-actions are set.
- [Reminders & analytics](reminders-and-analytics.md) — the other view over dated fields
  (`nextActionDate`, `lastActivityAt`) for follow-up nudges.
- [API reference](../api/reference.md#calendar) · [Data model](../architecture/data-model.md)
