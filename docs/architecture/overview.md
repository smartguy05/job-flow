# Architecture overview

JobFlow is a self-hosted, multi-user job-application tracker and tailored-resume generator.

## Stack

- **Next.js 16 (App Router)** — pages under `src/app/**`, API route handlers under
  `src/app/api/**`, one Edge middleware at `src/middleware.ts`.
- **PostgreSQL** via **Drizzle ORM** — `postgres.js` driver in production, `pglite`
  (in-process) in tests. See [database layer](database.md).
- **Authentik OIDC** for auth (hand-rolled code + PKCE flow, `jose` + `iron-session`).
  See [OIDC flow](../auth/oidc-flow.md).
- **docx + LibreOffice + poppler** for resume rendering (DOCX → PDF → page count).
- **Anthropic / OpenAI SDKs** for all LLM operations, behind one provider abstraction.

## Request lifecycle

1. A request hits **`src/middleware.ts`** first. It checks for a valid signed session
   cookie and either passes through, returns `401` (for `/api/*`), or redirects to
   `/login` (for pages). Public paths (`/api/auth/*`, `/api/cron/*`, `/login`, static
   assets, and the PWA asset routes `/manifest.webmanifest`, `/icon`, `/apple-icon`,
   `/icon.svg`) are exempt. See [sessions & middleware](../auth/sessions-and-middleware.md).
2. A **route handler** (`src/app/api/**/route.ts`) resolves the user with
   `getUser(req)` from `@/lib/auth`, returns `unauthorized()` if absent, then scopes
   every query by `user.id`. See [API reference](../api/reference.md).
3. **Business logic** lives in `src/lib/**` (pure/testable), not in React pages. LLM
   calls funnel through `src/lib/llm-provider.ts` (`complete()`); prompts live in
   `src/lib/llm.ts`.
4. **Data** is read/written through the Drizzle client in `src/db/index.ts`.

## Module map

| Area | Path | Notes |
|---|---|---|
| UI shell | `src/app/layout.tsx`, `src/components/SiteNav.tsx`, `src/app/globals.css` | Mobile-first responsive shell: desktop top bar + mobile bottom tab bar & drawer; design tokens/primitives. See [mobile & PWA](../features/mobile-and-pwa.md). |
| PWA metadata | `src/app/{manifest.ts,icon.tsx,apple-icon.tsx}`, `public/icon.svg` | Web app manifest + generated icons for install/home-screen. |
| DB client | `src/db/index.ts` | Driver select, lazy `db` proxy, `runMigrations()`. |
| Schema | `src/db/schema.ts` | All `pgTable`s; excluded from coverage. |
| Auth (edge-safe) | `src/lib/auth/session.ts` | Seal/unseal cookies; no `next/headers`/db. |
| Auth (OIDC) | `src/lib/auth/oidc.ts` | Discovery, PKCE, token exchange, `jose` verify. |
| Auth (route helpers) | `src/lib/auth.ts` | `getUser(req)`, `currentUser()`, `unauthorized()`. |
| User provisioning | `src/lib/auth/users.ts` | `upsertUserBySub`. |
| Career context | `src/lib/career.ts` | Assembles profile + files + skill for generation. |
| LLM provider | `src/lib/llm-provider.ts` | `complete()` dispatch on per-user provider setting. |
| LLM prompts | `src/lib/llm.ts` | Extraction, generation, refine, drafts, profile assist. |
| Resume render | `src/lib/render-resume.ts` | DOCX build + soffice/pdfinfo → buffers. |
| Resume service | `src/lib/resume-service.ts` | 2-page fit loop, persistence. |
| Settings | `src/lib/settings.ts` | Per-user key/value settings. |
| Events/dedup/ntfy | `src/lib/{events,dedup,ntfy}.ts` | Activity log, duplicate detection, push. |
| Startup | `src/instrumentation.ts` | Runs migrations once at server boot. |

## Cross-cutting properties

- **Multi-tenant.** Every domain table carries a `userId`; every query is scoped by it,
  and `[id]` routes return `404` (not `403`) on cross-tenant access. See
  [data model](data-model.md).
- **Never fabricate resume content.** Everything traces to the user's career profile +
  files. See [resume generation](../features/resume-generation.md).
- **Self-contained data.** Generated DOCX/PDF files are stored in Postgres as `bytea`,
  not on disk.

## Related

- [Data model](data-model.md) · [Database layer](database.md) ·
  [Deployment](../operations/deployment.md) · [Testing](../operations/testing.md)
