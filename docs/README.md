# JobFlow documentation

Self-hosted, multi-user job-application tracker + tailored-resume generator. This folder
documents how the system is built and operated. Start here and follow the links.

## Map

### Architecture
- [Overview](architecture/overview.md) — stack, request lifecycle, module map.
- [Data model](architecture/data-model.md) — tables, relationships, multi-tenancy, file storage.
- [Database layer](architecture/database.md) — driver selection, migrations, startup, tests.

### Authentication
- [OIDC flow](auth/oidc-flow.md) — Authentik authorization-code + PKCE, token/id_token handling.
- [Sessions & middleware](auth/sessions-and-middleware.md) — iron-session cookies, the route gate, `getUser`.
- [Authentik setup](auth/authentik-setup.md) — provider/application configuration walkthrough.

### Features
- [Applications & tracking](features/applications-and-tracking.md) — capture, dedup, CRUD, interviews, drafts, timeline.
- [Calendar](features/calendar.md) — month grid + agenda of interviews, deadlines, and next-actions across all applications.
- [Resume generation](features/resume-generation.md) — career profile/files/skill, render pipeline, 2-page fit, downloads.
- [Reminders & analytics](features/reminders-and-analytics.md) — per-user reminder sweep, ntfy, analytics.

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
