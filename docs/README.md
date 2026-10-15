# JobFlow documentation

Self-hosted, multi-user job-application tracker + tailored-resume generator. This folder
documents how the system is built and operated. Start here and follow the links.

## Map

### Architecture
- [Overview](architecture/overview.md) — stack, request lifecycle, module map.
- [Data model](architecture/data-model.md) — tables, relationships, multi-tenancy, file storage.
- [Database layer](architecture/database.md) — driver selection, migrations, startup, tests.
- [Service layer](architecture/service-layer.md) — `src/lib/services/`: user-scoped domain operations shared by routes (and MCP), typed errors.

### Authentication
- [OIDC flow](auth/oidc-flow.md) — Authentik authorization-code + PKCE, token/id_token handling.
- [Sessions & middleware](auth/sessions-and-middleware.md) — iron-session cookies, the route gate, `getUser`.
- [Authentik setup](auth/authentik-setup.md) — provider/application configuration walkthrough.

### Features
- [Applications & tracking](features/applications-and-tracking.md) — capture, dedup, CRUD, dashboard filtering (hides expired/closed by default), interviews, post-interview debrief (optional Whisper transcription), drafts, timeline.
- [Calendar](features/calendar.md) — month grid + agenda of interviews, deadlines, and next-actions across all applications, plus a subscribable `.ics` feed.
- [Resume generation](features/resume-generation.md) — career profile/files/skill, render pipeline, 2-page fit, downloads.
- [Interview prep](features/interview-prep.md) — AI prep pack per interview round (questions + answers, questions to ask, study checklist), regenerable and editable.
- [Interview questions](features/interview-questions.md) — checklist of questions to ask interviewers: general (all jobs) + job-specific, per-job checks and answer notes, import from prep pack.
- [Employment history](features/employment-history.md) — jobs you hold: comp timeline, benefits, work journal (achievements, technologies, complaints), AI profile sync with approval, backfill import; auto-created on `closed_won`.
- [Prior inventions (Exhibit A)](features/prior-inventions.md) — structured list of prior inventions/works of authorship; AI drafting (describe, GitHub repo, suggest from history, import), DOCX/PDF/text export, per-entry opt-in to resumes.
- [Offer comparison](features/offer-comparison.md) — side-by-side table + AI verdict across competing offers, with benefits-PDF upload.
- [Reminders & analytics](features/reminders-and-analytics.md) — per-user reminder sweep, ntfy, analytics.
- [Mobile & PWA](features/mobile-and-pwa.md) — mobile-first responsive shell, bottom-nav + drawer, installable PWA.

### Operations
- [Configuration](operations/configuration.md) — environment variables.
- [Deployment](operations/deployment.md) — Docker, Compose, Cloudflare Tunnel.
- [Testing](operations/testing.md) — Vitest + pglite harness, helpers, coverage.

### Reference
- [API reference](api/reference.md) — every HTTP endpoint, grouped by resource.

## Conventions

- Each file stays under **500 lines**; split a topic across files rather than exceeding it.
- Related docs **cross-link** with relative Markdown links.
- This index (`docs/README.md`) lists every doc — update it when adding or removing one.
- Keeping docs current is part of every change; see the "Documentation" section in the
  repo-root `CLAUDE.md` for which code areas map to which docs.
