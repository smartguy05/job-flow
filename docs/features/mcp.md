# MCP server (use JobFlow from Claude)

JobFlow exposes a [Model Context Protocol](https://modelcontextprotocol.io) server at
`${APP_BASE_URL}/api/mcp`. Claude (claude.ai, Claude Desktop, mobile, Claude Code) can then
capture jobs, review and update applications, find follow-ups, generate resumes, draft
messages and keep the work journal, all as the signed-in user. Sign-in uses the same
Authentik instance as the web app, through OAuth 2.1.

## How it works

- **Transport.** Streamable HTTP in **stateless** mode. `src/app/api/mcp/route.ts` (Node
  runtime) builds a fresh `McpServer` (`buildMcpServer(userId)` in `src/lib/mcp/server.ts`)
  and a fresh `WebStandardStreamableHTTPServerTransport` (`sessionIdGenerator: undefined`)
  for every `POST`. It answers with an SSE stream, which sends keep-alive frames during long
  tool calls such as `generate_resume`. `GET` and `DELETE` return `405` (there is no
  standalone stream and no session to end) once the caller is authenticated.
  The SDK is `@modelcontextprotocol/sdk`, pinned to an exact version in `package.json`. Its
  web-standard transport takes a `Request` and returns a `Response`, so no Node `req`/`res`
  bridge is needed.
- **Auth.** JobFlow is an OAuth *resource server*, and Authentik is the *authorization
  server*. Each request needs `Authorization: Bearer <access token>`. `getBearerUser(req)`
  (`src/lib/auth.ts`) verifies the token with `verifyAccessToken` (`src/lib/auth/oidc.ts`),
  then looks up the user by `sub`. See [OIDC flow](../auth/oidc-flow.md#mcp-access-tokens).
  Users are **not** auto-provisioned here: a person must have signed in to the web app at
  least once, or they get `401`. Session cookies are ignored on this endpoint.
- **Discovery.** A `401` carries
  `WWW-Authenticate: Bearer resource_metadata="${APP_BASE_URL}/.well-known/oauth-protected-resource"`.
  That RFC 9728 document (`src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts`,
  helpers in `src/lib/mcp/http.ts`) lists:
  - `resource`: `${APP_BASE_URL}/api/mcp`;
  - `authorization_servers`: `[MCP_OAUTH_ISSUER ?? OIDC_ISSUER]`;
  - `scopes_supported`: `openid profile email offline_access`;
  - `bearer_methods_supported`: `["header"]`.

  The same document is also served at the path-suffixed URL
  `/.well-known/oauth-protected-resource/api/mcp`. Claude then reads Authentik's own OIDC
  discovery and runs the authorization-code + PKCE flow against it.
- **Middleware.** `/api/mcp` and `/.well-known` are in `PUBLIC_PREFIXES`
  (`src/middleware.ts`). Both routes check auth themselves, like the calendar feed. See
  [sessions & middleware](../auth/sessions-and-middleware.md).

## Tools

The tools are defined in `src/lib/mcp/tools/*.ts` and registered in
`src/lib/mcp/registry.ts` (`TOOLS`). Each one has a zod input schema and a handler
`(userId, args)` that calls the [service layer](../architecture/service-layer.md), so
results match the web UI exactly. Results come back as JSON text. A `NotFoundError` or
`ValidationError` (including another user's id) is returned as an `isError` result, and
file bytes are never returned.

| Tool | What it does |
|---|---|
| `capture_job` | `{ text, companyHint?, contactHint?, save?, markApplied?, allowDuplicate? }`. Runs `extractJob` and `findDuplicates`. Only the known extraction fields are saved; any other key the model emits (`status`, `notes`, `appliedAt`, `contactId`, …) is dropped, since pasted text may carry prompt injection. Nothing is saved unless `save` is true, and a save is held back (`note`) when likely duplicates exist unless `allowDuplicate` is set. |
| `list_applications` | `{ status?, search?, includeClosed? }`. Compact rows filtered with `filterApplications` (`src/lib/dashboard-filter.ts`). Closed and expired rows are hidden by default. |
| `get_application` | `{ id }`. Full detail: fields, JD, contact, interviews, drafts, events, resume versions (`hasPdf`/`hasDocx`) and file metadata. |
| `update_application` | `{ id, status?, nextAction?, nextActionDate?, notes?, interestRating?, … }`. A status change logs an event, and `closed_won` creates a job. |
| `add_interview` / `update_interview` | Create or update an interview round (`scheduledAt`, `round`, `interviewer`, `prepNotes`, `outcome`). |
| `needs_attention` | Quiet or overdue open applications (`candidatesForUser`, using the user's `reminderQuietDays`). |
| `generate_resume` | `{ applicationId }`. Runs `createResumeForApplication`, then returns the version, page count, fit warning and absolute download URLs. The URLs need a browser session in JobFlow. |
| `draft_message` | `{ applicationId, type?, extra? }`. A reply, cover letter or follow-up via `createDraft` (`src/lib/services/drafts.ts`), saved on the application. |
| `list_jobs` | Employment history (`listJobs`). |
| `add_journal_entry` | `{ jobId, title, body?, kind?, impact?, entryDate?, technologies? }`. |
| `list_journal` | `{ jobId?, kind?, from?, to? }`. Spans all jobs when `jobId` is omitted. |
| `ingest_email` | `{ messageId, from, subject, date?, body, apply? }`. Classify one email, rank matching applications and propose actions; applies only with `apply` and a single confident match. Idempotent per message. See [email ingestion](email-ingestion.md). |
| `get_analytics` | No input. The same outcome analytics as `GET /api/analytics` (funnel by source, time to first response, response rate by resume variant/seniority/location/interest, `smallSample` flags). See [reminders & analytics](reminders-and-analytics.md#outcome-analytics-get-apianalytics). |
| `apply_email_actions` | `{ messageId, applicationId, actions }`. Apply user-approved actions (`set_status`, `add_interview`, `set_next_action`, `log_event`) from an ingested email, once. |

## Prompts

Prompts are defined in `src/lib/mcp/prompts.ts` (`PROMPTS`) and registered alongside the
tools by `buildMcpServer`. Arguments are strings, as MCP requires.

| Prompt | What it does |
|---|---|
| `triage_job_emails` | `{ days?, autoApply? }`. Tells Claude to search the user's Gmail (with its own Gmail connector) for recent ATS, recruiter, interview and rejection mail, call `ingest_email` for each message, ask about ambiguous matches and finish with `apply_email_actions`. See [email ingestion](email-ingestion.md). |

To add a tool, write it with `defineTool` (`src/lib/mcp/tool.ts`), append it to `TOOLS`, and
test the handler through `callTool(name, userId, args)`, including a cross-tenant case.

## Set up Authentik

See [Authentik setup](../auth/authentik-setup.md#6-mcp-connector-claude). In short:

1. Add `https://claude.ai/api/mcp/auth_callback` as a redirect URI on the provider. For
   Claude Code, also add loopback redirects (see below).
2. Add the `offline_access` scope mapping, so Claude gets a refresh token. Authentik access
   tokens are short-lived (5 minutes by default).
3. Either reuse the web provider, so the audience is `OIDC_CLIENT_ID` and nothing else needs
   configuring, or create a dedicated provider and set `MCP_OAUTH_ISSUER` and
   `MCP_OAUTH_AUDIENCE` (see [configuration](../operations/configuration.md)).

Authentik has no dynamic client registration, so the client ID and secret are entered
manually in each Claude client.

## Connect from Claude

**claude.ai, Claude Desktop and mobile.** These share one connector list.

1. Go to **Settings → Connectors → Add custom connector**.
2. For the URL, enter `https://jobs.example.com/api/mcp`.
3. Open **Advanced settings** and paste the Authentik provider's **OAuth Client ID** and
   **OAuth Client Secret**.
4. Click **Connect**, sign in to Authentik and approve. Then enable the connector in a chat.

The hosted apps reach your server from Anthropic's network, so `APP_BASE_URL` and Authentik
must both be reachable from the internet. Don't put Cloudflare Access in front of
`/api/mcp`, `/.well-known/*` or Authentik's OAuth endpoints. See
[deployment](../operations/deployment.md#cloudflare-tunnel).

**Claude Code.** Claude Code runs the OAuth flow locally, with a loopback redirect
(`http://localhost:<port>/callback`).

```bash
claude mcp add --transport http jobflow https://jobs.example.com/api/mcp \
  --client-id <OIDC client id> --client-secret --callback-port 33418
```

`--client-secret` prompts for the secret. These flags exist in recent Claude Code versions;
check `claude mcp add --help` on yours. Then run `/mcp` in Claude Code to sign in. Register the matching redirect URI in Authentik:
either strictly `http://localhost:33418/callback`, or the regex form
`http://(localhost|127\.0\.0\.1):\d+/callback` so that any port works. For local
development, use `http://localhost:3000/api/mcp` instead.

## Verify by hand

```bash
curl -si -X POST https://jobs.example.com/api/mcp | grep -i www-authenticate
curl -s https://jobs.example.com/.well-known/oauth-protected-resource | jq
```

Expect a `401` with the `resource_metadata` challenge, then the metadata document. After you
connect, ask Claude to "list my JobFlow applications".

## Testing

The tests use a local jose RS256 keypair. `installTestIssuer()` in `src/test/oidc.ts`
stubs `fetch` for Authentik discovery and JWKS, so no real IdP is called.

- `src/lib/auth/access-token.test.ts` covers audience, issuer, expiry and the dedicated
  issuer.
- `src/lib/auth/bearer.test.ts` checks that an unknown `sub` gives `null`.
- `src/app/api/mcp/route.test.ts` checks the `401` challenge, then runs a real `initialize`
  → `tools/list` → `tools/call` JSON-RPC round trip.
- `src/lib/mcp/server.test.ts` covers registration and per-user binding through the SDK's
  in-memory client.
- `src/lib/mcp/tools/*.test.ts` cover each handler, including cross-tenant cases.

See [testing](../operations/testing.md).

## Related

- [Authentik setup](../auth/authentik-setup.md) · [OIDC flow](../auth/oidc-flow.md) ·
  [Sessions & middleware](../auth/sessions-and-middleware.md)
- [Service layer](../architecture/service-layer.md) · [API reference](../api/reference.md) ·
  [Configuration](../operations/configuration.md)
- [Applications & tracking](applications-and-tracking.md) ·
  [Resume generation](resume-generation.md) · [Employment history](employment-history.md) ·
  [Email ingestion](email-ingestion.md)
