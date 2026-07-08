# Configuration

All configuration is via environment variables (see `.env.example`). Two layers:

- **Env vars** — infrastructure + secrets, set by the operator.
- **Per-user settings** — stored in the `settings` table, edited in the app's Settings page.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string. In Compose it targets the `postgres` service. See [database layer](../architecture/database.md). |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | ✅ (Compose) | Credentials the Compose `postgres` service is created with; must match `DATABASE_URL`. |
| `APP_BASE_URL` | ✅ | Public https base URL. Used to build the OIDC redirect URI, all post-login/logout redirects, and the absolute calendar-feed subscription URL — **never** the request host. |
| `OIDC_ISSUER` | ✅ | Authentik issuer, e.g. `https://auth.example.com/application/o/jobflow/` (no `.well-known` suffix). |
| `OIDC_CLIENT_ID` | ✅ | OAuth2 client ID. |
| `OIDC_CLIENT_SECRET` | ✅ | OAuth2 client secret (confidential client). |
| `SESSION_SECRET` | ✅ | iron-session cookie encryption password, **≥32 chars** (`openssl rand -base64 48`). |
| `ANTHROPIC_API_KEY` | one of | Anthropic key (operator-wide). |
| `OPENAI_API_KEY` | one of | OpenAI key (operator-wide). At least one provider key is required. **Also required for interview-debrief audio transcription** (Whisper), even when the chat provider is Anthropic — Anthropic has no transcription endpoint. Without it, pasting a transcript still works; audio upload is disabled. |
| `CRON_SECRET` | optional | If set, `POST /api/cron/reminders` requires header `x-cron-secret`. |
| `USE_PGLITE` | optional | `1` forces the in-process test DB (auto-on when `NODE_ENV=test`). |
| `SKIP_DB_MIGRATE` | optional | `1` skips the startup migration hook. |

### Notes

- **LLM keys are operator-wide**, shared by all users; users only pick *which* provider to
  use (a per-user setting). Keys are read from `process.env`, never stored per user.
- `APP_BASE_URL` is required (it drives OIDC correctness), and for local testing it should
  be `http://localhost:3000`. See [Authentik setup](../auth/authentik-setup.md).

## Per-user settings (`settings` table)

Managed via `GET/PUT /api/settings` and `src/lib/settings.ts` (`AppSettings`,
`DEFAULT_SETTINGS`). Defaults apply until overridden per user.

| Key | Default | Meaning |
|---|---|---|
| `provider` | `anthropic` | Which LLM provider to use (`anthropic` \| `openai`). |
| `anthropicModel` | `claude-fable-5` | Model when provider is Anthropic. |
| `openaiModel` | `gpt-5.4` | Model when provider is OpenAI. |
| `transcriptionModel` | `whisper-1` | OpenAI audio-transcription model for interview debriefs (uses `OPENAI_API_KEY` regardless of `provider`). |
| `dedupWindowDays` | `30` | Duplicate-detection window. |
| `reminderQuietDays` | `7` | Quiet period before a follow-up reminder. |
| `expireApplicationsAfterDays` | `30` | Auto-expire an open application after this many days with no activity (`0` disables). |
| `ntfyUrl` | `""` | ntfy topic URL for reminders. |
| `ntfyEnabled` | `false` | Whether reminders are pushed. |
| `subtitleDefault` | *(a role subtitle)* | Default resume subtitle. |

The resume "skill" and career files are **not** in `settings`; they have their own tables
and routes (see [resume generation](../features/resume-generation.md)).

## Related

- [Deployment](deployment.md) · [Authentik setup](../auth/authentik-setup.md) ·
  [Database layer](../architecture/database.md) · [Reminders & analytics](../features/reminders-and-analytics.md)
