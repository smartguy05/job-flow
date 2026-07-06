# Deployment

Target: Docker on a Proxmox CT behind a Cloudflare Tunnel. Env vars are covered in
[configuration](configuration.md); auth setup in [Authentik setup](../auth/authentik-setup.md).

## Docker Compose

`docker-compose.yml` defines three services:

- **`postgres`** — `postgres:17-alpine`, named volume `jobflow-pgdata`, `pg_isready`
  healthcheck.
- **`jobflow`** — built from the `Dockerfile`; `depends_on postgres: service_healthy`;
  publishes `3000:3000`; receives `DATABASE_URL`, the OIDC/`SESSION_SECRET` vars,
  `APP_BASE_URL`, provider keys, and `CRON_SECRET`.
- **`reminders`** — a `curl` sidecar that POSTs `/api/cron/reminders` hourly with
  `x-cron-secret`. See [reminders](../features/reminders-and-analytics.md).

```bash
cp .env.example .env    # fill DB creds, OIDC_*, SESSION_SECRET, APP_BASE_URL, a provider key
docker compose up -d --build
```

Migrations run automatically at app startup (`src/instrumentation.ts`); no separate step.
See [database layer](../architecture/database.md).

## Dockerfile

Multi-stage `node:22-bookworm-slim`, `output: "standalone"` (`node server.js`):

- **deps** → `npm install -g npm@11.6.2 && npm ci` (pure-JS deps; no native toolchain —
  `postgres.js`/`pglite` need no compiler). npm is pinned to 11.x because the base image
  ships npm 10, which resolves the optional dependency tree (`esbuild`/`@emnapi`) differently
  from the npm-11 `package-lock.json` and would reject it at `npm ci` with spurious
  "Missing … from lock file" errors. Keep the pin in step with whatever npm regenerated the
  lockfile.
- **builder** → `npm run build`.
- **runner** → installs `libreoffice-writer` + `poppler-utils` + fonts (needed for resume
  rendering), copies the standalone output plus `drizzle/` (migrations) and `spec/` (the
  default resume skill). Exposes `3000`.

A `.dockerignore` keeps the `COPY . .` build context small and, importantly, keeps `.env`
(secrets), `node_modules`, `.git`, and tests out of the image layers — runtime env is
injected by Compose, never baked in.

## Cloudflare Tunnel

Point the tunnel's public hostname (e.g. `jobs.example.com`) at the CT's
`http://<host>:3000`. TLS terminates at Cloudflare; the app listens on plain `:3000`
internally.

- Because all redirects derive from `APP_BASE_URL`, **no `X-Forwarded-*` trust is needed**.
- Register `${APP_BASE_URL}/api/auth/callback` and `${APP_BASE_URL}/login` in Authentik.
- Cloudflare Access is optional/complementary — OIDC is the real gate.

## Local run against a real Postgres

For a production-like local run (Docker image, not `npm run dev`):

```bash
docker compose up -d postgres      # or any reachable Postgres
docker compose up -d --build jobflow
```

For pure local dev with hot reload, run a Postgres container and:

```bash
DATABASE_URL=postgres://jobflow:jobflow@localhost:5432/jobflow \
APP_BASE_URL=http://localhost:3000 npm run dev
```

(`npm run dev` sets `NODE_ENV=development`, so the session cookie is non-Secure and plain
`http://localhost` works.) See [Authentik setup](../auth/authentik-setup.md) for the
localhost redirect URIs.

## Backup

Everything (applications, resumes + their file bytes, career data, settings) is in
Postgres:

```bash
docker exec jobflow-db pg_dump -U jobflow jobflow > jobflow-backup.sql
```

## Related

- [Configuration](configuration.md) · [Database layer](../architecture/database.md) ·
  [Authentik setup](../auth/authentik-setup.md) · [Testing](testing.md)
