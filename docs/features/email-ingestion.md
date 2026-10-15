# Email ingestion (through MCP)

JobFlow can turn job-search email into application updates: a rejection proposes closing the
application, an interview invite proposes an interview round, and so on. JobFlow never
connects to a mailbox and never stores mail credentials. Claude reads the user's Gmail with
the user's **own** mail connector and hands each message to JobFlow over the
[MCP server](mcp.md) with the `ingest_email` tool.

## Flow

1. The user runs the **`triage_job_emails`** MCP prompt in Claude (or just asks Claude to
   check their job mail).
2. Claude searches Gmail (recent ATS senders, recruiter mail, "unfortunately", "interview",
   "offer"…) and calls `ingest_email` for each relevant message.
3. JobFlow classifies the email, ranks the user's applications it could be about, and
   proposes actions. Nothing changes unless `apply: true` was passed **and** there is a single
   confident match.
4. For anything ambiguous, Claude shows the candidates and proposed actions, asks the user,
   and calls `apply_email_actions` with the chosen application.
5. Applied emails show up as `email` events on the application timeline (marked ✉) and in
   **Recent email activity** on the dashboard.

## Classification

`classifyEmail({ userId, from, subject, date, body })` in `src/lib/llm.ts` uses the usual
`complete({ json: true })` → `parseJson` → zod pattern. The schema lives in
`src/lib/email-content.ts` (`EmailClassificationSchema`):

| Field | Meaning |
|---|---|
| `kind` | `rejection`, `interview_invite`, `recruiter_reply`, `offer`, `application_ack` or `other`. Unknown values become `other`. |
| `company`, `roleTitle` | The hiring company and role, or `null`. |
| `interviewAt` | ISO date-time when a specific time is stated; unparseable values become `null`. |
| `summary` | One sentence (capped at 500 chars). |
| `suggestedNextAction` | Short imperative, or `null`. |

The body is truncated to 20,000 characters before it is sent. The system prompt tells the
model to treat the email as data and ignore instructions inside it. The tests mock the LLM.

## Matching

`src/lib/email-ingest.ts` holds a pure ranking function, `rankCandidates(input, apps)`, and a
DB loader, `loadCandidateApps(userId)` (the user's applications with their contact's email,
filtered by `userId`). Signals, strongest first:

1. **Contact email.** The sender's address equals the application's contact email (0.95).
2. **Sender domain.** The sender's registrable domain (`baseDomain`) equals the posting
   link's host (0.85), equals the normalized company (0.8), or is a prefix-match of it (0.65).
   Free-mail, ATS and job-board domains (`gmail.com`, `greenhouse.io`, `lever.co`,
   `myworkday.com`, `linkedin.com`…) never count, for either the sender or the link, so
   one Greenhouse email cannot match every Greenhouse application.
3. **Extracted company + role.** The classifier's company, normalized with
   `normalizeCompany`, equals the application's; the score is `0.6 + 0.35 × roleSimilarity`
   (both from `src/lib/dedup.ts`).

Each extra signal adds 0.05; closed applications lose 0.05 so an open one wins a tie;
confidence is capped at 0.99. `pickConfidentMatch` returns the top candidate only when it is
at least **0.75** and leads the runner-up by at least **0.1**.

## Proposed actions

`proposeActions(classification, currentStatus)` returns a list from a closed set
(`EmailActionSchema`, a zod discriminated union). A status change the application already
has is left out.

| Kind | Actions |
|---|---|
| `rejection` | `set_status → closed_lost` |
| `interview_invite` | `set_status → in_progress`, `add_interview { scheduledAt: interviewAt }` |
| `offer` | `set_status → in_progress`, `set_next_action` ("Review the offer" or the suggestion) |
| `recruiter_reply` | `set_next_action` ("Reply to the recruiter" or the suggestion) |
| `application_ack`, `other` | none |

Every kind also proposes `log_event` with "Email (kind): summary" (truncated to the 500-char
event-detail limit). Action input is validated up front, including that `nextActionDate` is a
real date, so a bad action is rejected before any action runs.

## Applying and idempotency

`src/lib/services/emails.ts`:

- **`ingestEmail(userId, input)`** classifies, ranks and proposes, then upserts an
  `ingested_emails` row keyed on `(userId, messageId)`. If that row was already applied, it
  returns `alreadyApplied: true` without calling the LLM.
- **`applyEmailActions(userId, { messageId, applicationId, actions })`** validates the
  actions, checks the application belongs to the user, then claims the row atomically
  (`UPDATE … SET applied_at = now() WHERE applied_at IS NULL`). A second apply gets a
  `ValidationError`, and an unknown message gets a `NotFoundError`. Actions run through the
  regular services (`updateApplication`, `addInterview`, `logEvent`), so status events, the
  `appliedAt` backfill and the `closed_won` → job hook all behave as in the web UI. An `email`
  event is always logged. If an action throws, the claim is released so the call can be
  retried.
- **`listRecentEmails(userId, limit)`** serves the dashboard.

Only the message id, sender, subject, received date, kind, summary and applied actions are
stored. The body is never persisted. See [data model](../architecture/data-model.md).

## MCP surface

Registered in `src/lib/mcp/registry.ts` and `src/lib/mcp/prompts.ts`:

| Name | Kind | Input |
|---|---|---|
| `ingest_email` | tool | `{ messageId, from, subject, date?, body, apply? }`. Returns `classification`, `candidates`, `match`, `proposedActions`, `applied`, `applicationId`, `alreadyApplied` and an optional `note`. |
| `apply_email_actions` | tool | `{ messageId, applicationId, actions }`, using the action shapes above. |
| `triage_job_emails` | prompt | `{ days?, autoApply? }` (strings). Builds the Gmail query (`newer_than:<days>d …`, default 7 days, max 90) and the step-by-step instructions. Without `autoApply` Claude proposes and asks before applying. |

## Web UI

- The application timeline (`src/app/applications/[id]/page.tsx`) shows `email` events with
  a ✉ marker.
- The dashboard (`src/app/page.tsx`) shows the last five ingested emails from
  `GET /api/emails?limit=5`, linked to their application. See the
  [API reference](../api/reference.md#emails).

## Verify by hand

With the Gmail connector and the JobFlow connector both enabled in Claude, run the
`triage_job_emails` prompt. A rejection from a company you applied to should propose
`closed_lost`. Running it again reports the applied messages as already processed.

## Testing

- `src/lib/email-content.test.ts`: schema coercion.
- `src/lib/email-ingest.test.ts`: sender parsing, domain reduction, ranking, generic-domain
  exclusion, the confidence rule, action proposals and the tenant-scoped loader.
- `src/lib/services/emails.test.ts`: propose/apply, idempotency, ambiguity, interviews,
  cross-tenant isolation, claim release.
- `src/lib/mcp/tools/emails.test.ts` and `src/lib/mcp/server.test.ts`: tool handlers and
  prompt registration.
- `src/app/api/emails/route.test.ts`: auth and scoping.

## Related

- [MCP server](mcp.md) · [Applications & tracking](applications-and-tracking.md) ·
  [Reminders & analytics](reminders-and-analytics.md)
- [Data model](../architecture/data-model.md) · [Service layer](../architecture/service-layer.md) ·
  [API reference](../api/reference.md)
