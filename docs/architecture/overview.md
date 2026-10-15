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
   `/login` (for pages). Public paths (`/api/auth/*`, `/api/cron/*`, `/api/calendar/feed`,
   `/api/mcp` and `/.well-known/*` (both self-guarded by OAuth bearer tokens), `/login`, static
   assets, and the PWA asset routes `/manifest.webmanifest`, `/icon`, `/apple-icon`,
   `/icon.svg`) are exempt. See [sessions & middleware](../auth/sessions-and-middleware.md).
2. A **route handler** (`src/app/api/**/route.ts`) resolves the user with
   `getUser(req)` from `@/lib/auth`, returns `unauthorized()` if absent, then scopes
   every query by `user.id`. Most handlers delegate to a user-scoped function in
   `src/lib/services/` and map its `NotFoundError` / `ValidationError` to 404 / 400. See
   [service layer](service-layer.md) and [API reference](../api/reference.md).
   The **MCP endpoint** (`/api/mcp`) is the other entry point. It authenticates with an
   Authentik bearer token (`getBearerUser`), and its tools call the same services. See
   [MCP server](../features/mcp.md).
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
| Auth (route helpers) | `src/lib/auth.ts` | `getUser(req)`, `currentUser()`, `unauthorized()`, `getBearerUser(req)` (MCP tokens). |
| MCP server | `src/lib/mcp/**`, `src/app/api/mcp/route.ts`, `src/app/.well-known/oauth-protected-resource/` | `buildMcpServer(userId)`, tool registry, OAuth discovery metadata. See [MCP server](../features/mcp.md). |
| User provisioning | `src/lib/auth/users.ts` | `upsertUserBySub`. |
| Career context | `src/lib/career.ts` | Assembles profile + files + skill for generation. |
| LLM provider | `src/lib/llm-provider.ts` | `complete()` dispatch on per-user provider setting. |
| LLM prompts | `src/lib/llm.ts` | Extraction, generation, refine, drafts, profile assist, self-review draft. |
| Resume render | `src/lib/render-resume.ts` | DOCX build + soffice/pdfinfo → buffers. |
| Resume service | `src/lib/resume-service.ts` | 2-page fit loop, persistence. |
| Services | `src/lib/services/*.ts` | User-scoped domain operations shared by routes and MCP tools. See [service layer](service-layer.md). |
| Career growth | `src/lib/{career-growth,brag-doc,growth-routes}.ts` | People/1:1/review/goal parsing and manager history, the pure brag doc (Markdown/DOCX), and shared `/api/jobs/[id]/*` handlers. See [career growth](../features/career-growth.md). |
| Equity, PTO, job documents | `src/lib/{vesting,pto,job-files}.ts` | Pure vesting schedule math, PTO balance and weekday counts, and job-document upload rules. |
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

- [Data model](data-model.md) · [Database layer](database.md) · [Service layer](service-layer.md) · [MCP server](../features/mcp.md) ·
  [Career growth](../features/career-growth.md) · [Deployment](../operations/deployment.md) · [Testing](../operations/testing.md)
