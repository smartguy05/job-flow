# JobFlow

Self-hosted, multi-user job-application tracker + tailored-resume generator. Sign in via
your identity provider (Authentik / OIDC), paste a recruiter message, job description, or
link; JobFlow extracts the details, warns you if you've already applied to that company for
a similar role, generates a resume tailored to the posting (rendered to **PDF and DOCX**,
forced to exactly 2 pages), and tracks the application through your pipeline. Every user has
their own private applications, resumes, career files, and generation "skill".

## Features

- **Capture** — paste a recruiter message / JD / link, plus optional contact + company.
  An LLM extracts company, role, contact, and a clean job-description snapshot.
- **Duplicate warning** — flags prior applications to the same company + similar role
  within a configurable window (default 30 days).
- **Resume generation** — tailors your career profile + career files to the role using your
  editable resume **skill**, renders DOCX → PDF, and auto-expands/condenses to hit exactly
  2 pages. Every version is stored (in the database) and re-downloadable.
- **Per-user career files & skill** — supply multiple source documents and edit the
  instructions that steer how your resumes are generated, all under **Career profile**.
- **OpenAI or Anthropic** — pick your provider and model in Settings; the choice applies
  to all AI operations (extraction, generation, refinement, drafts).
- **Review & refine** — edit resume text directly, or give free-text feedback ("lead
  with my AI work", "cut the casino role") and the LLM revises + re-renders.
- **Tracking** — statuses (Applied → In progress → Closed won/lost), notes, contacts,
  interview records, and a per-application timeline.
- **Drafts** — generate a recruiter reply, cover letter, or follow-up message.
- **Follow-up reminders** — ntfy push when an open application goes quiet (per user).
- **Analytics** — response rate, interview rate, pipeline, applications per month.

## Stack

Next.js (App Router) · PostgreSQL (Drizzle, `postgres.js`; `pglite` in tests) · Authentik
OIDC auth (`iron-session` + `jose`) · Anthropic + OpenAI SDKs · docx + LibreOffice/poppler
for rendering. Data — including generated DOCX/PDF files (as `bytea`) — lives entirely in
Postgres.

## Run with Docker

```bash
cp .env.example .env       # fill in DATABASE_URL creds, OIDC_*, SESSION_SECRET, APP_BASE_URL, provider key
docker compose up -d --build
```

This starts Postgres, the app, and the hourly reminder sidecar. Migrations run automatically
at app startup. Put the app behind your reverse proxy / Cloudflare Tunnel for TLS + remote
access, and register `${APP_BASE_URL}/api/auth/callback` as the redirect URI in Authentik.

## Configuration

Required:
- **`DATABASE_URL`** — Postgres connection string (compose points this at the `postgres` service).
- **`APP_BASE_URL`** — public https base URL; used to build OIDC redirect + post-login/logout URLs.
- **`OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`** — Authentik OIDC provider.
- **`SESSION_SECRET`** — ≥32-char cookie encryption password (`openssl rand -base64 48`).
- **`ANTHROPIC_API_KEY`** and/or **`OPENAI_API_KEY`** — operator-wide provider key(s); users
  pick which provider to use in Settings.

Optional:
- **`CRON_SECRET`** — if set, the reminder endpoint requires header `x-cron-secret`.
- Per user, in **Settings**: dedup window, reminder quiet-period, ntfy topic URL, model, subtitle.

New users start with an empty career profile; fill it in (and add career files / customize the
resume skill) under **Career profile**. The shipped default skill lives at `spec/resume-skill/`.

## Local development

```bash
npm install
# point DATABASE_URL at a local Postgres, or run: docker compose up -d postgres
npm run dev            # http://localhost:3000
```

Requires `soffice` (LibreOffice) and `pdfinfo` (poppler-utils) on PATH for rendering. Tests
use an in-process Postgres (`pglite`) — no external database needed: `npm test`.

## Backup

Everything (applications, resumes + their files, career data, settings) is in Postgres.
Back up the `jobflow-pgdata` volume, e.g.:

```bash
docker exec jobflow-db pg_dump -U jobflow jobflow > jobflow-backup.sql
```
