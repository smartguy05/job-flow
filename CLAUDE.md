# JobFlow — developer guide

Self-hosted, multi-user job-application tracker + tailored-resume generator. Next.js (App
Router) + PostgreSQL (Drizzle, `postgres.js`) + docx/LibreOffice rendering, supporting
OpenAI or Anthropic. Auth is Authentik OIDC (hand-rolled code+PKCE flow, `iron-session` +
`jose`); every table is scoped by `userId` and all API routes require a session. Generated
resume files are stored in Postgres as `bytea`.

## Testing is mandatory — use TDD

Follow test-driven development for all non-trivial changes:

1. **Red** — write a failing test that specifies the new behavior *before* writing the
   implementation. Run it and watch it fail for the right reason.
2. **Green** — write the minimum code to make the test pass.
3. **Refactor** — clean up with the test as a safety net.

Rules:
- New features and bug fixes require tests in the same change. A bug fix starts with a
  test that reproduces the bug.
- Keep coverage at **≥70% (goal 80%)** on the logic modules (`src/lib`, `src/db`,
  `src/app/api`). Run `npm run test:coverage` before considering work done.
- Put business logic in `src/lib` (pure/testable) rather than in React pages, so it can
  be unit-tested without a browser.
- Tests use **Vitest**. DB-touching tests get an isolated in-process Postgres (`pglite`)
  per file via `vitest.setup.ts`, which also runs migrations and seeds a test user
  (`globalThis.__testUserId` / `__testCookie`). Use `@/test/req`: `req()` (authenticated),
  `anonReq()` (401 cases), `insertApp()` (async), `seedUser()` (cross-tenant tests). Mock
  the LLM layer (`@/lib/llm` or `@/lib/llm-provider`) — never call a real model API in tests.

## Commands

- `npm run dev` — dev server (loads `.env`)
- `npm test` — run the suite once
- `npm run test:watch` — watch mode
- `npm run test:coverage` — coverage report
- `npm run build` — production build (also type-checks)
- `npx drizzle-kit generate` — create a migration after editing `src/db/schema.ts`

## Architecture notes

- All LLM calls funnel through `src/lib/llm-provider.ts` (`complete()`), which dispatches
  on the `provider` setting. `src/lib/llm.ts` holds the prompts; it must not import an
  SDK directly.
- Resume generation: LLM returns structured JSON (`src/lib/resume-content.ts` zod schema)
  → `src/lib/render-resume.ts` applies the template → DOCX → PDF → page count →
  `src/lib/resume-service.ts` runs the 2-page fit loop.
- Never fabricate resume content: everything must trace to the user's career profile +
  career files. Per-user career context and the editable "skill" are assembled in
  `src/lib/career.ts` (`getCareerInfo` / `getResumeSkill`, the latter falling back to the
  shipped `spec/resume-skill/SKILL.md`).
- Auth: `src/lib/auth/session.ts` is Edge-safe (no `next/headers`/db) and used by
  `src/middleware.ts`; route handlers use `getUser(req)` / `unauthorized()` from
  `src/lib/auth.ts`. Migrations run at startup via `src/instrumentation.ts`.

## Documentation

Feature and system documentation lives in `docs/`, organized into directories. `docs/README.md`
is the index — every doc is linked from it.

Structure:
- `docs/architecture/` — `overview.md`, `data-model.md`, `database.md` (stack, schema,
  DB/driver/migrations).
- `docs/auth/` — `oidc-flow.md`, `sessions-and-middleware.md`, `authentik-setup.md`.
- `docs/features/` — one file per feature area (`applications-and-tracking.md`,
  `resume-generation.md`, `reminders-and-analytics.md`).
- `docs/operations/` — `configuration.md`, `deployment.md`, `testing.md`.
- `docs/api/` — `reference.md` (every endpoint, grouped by resource).

Authoring rules:
- **≤500 lines per file.** If a topic outgrows that, split it and cross-link, don't overflow.
- **Cross-link related docs** with relative Markdown links, and end each file with a
  "Related" list.
- **Update `docs/README.md`** whenever you add or remove a doc file.
- Describe behavior and point to the real code paths; don't paste large code blocks.

Keep docs current as part of the change that alters behavior (like tests) — a change isn't
done until its docs are updated. Map of what to touch:
- Schema/tables/migrations (`src/db/**`) → `docs/architecture/data-model.md`, `database.md`.
- Any API route (`src/app/api/**`) → `docs/api/reference.md` + the relevant
  `docs/features/*` file.
- Auth/session/middleware (`src/lib/auth/**`, `src/lib/auth.ts`, `src/middleware.ts`,
  `src/app/api/auth/**`) → `docs/auth/*`.
- Resume pipeline / career context (`src/lib/{career,llm,render-resume,resume-service}.ts`)
  → `docs/features/resume-generation.md`.
- Env vars or per-user settings (`.env.example`, `src/lib/settings.ts`) →
  `docs/operations/configuration.md`.
- Docker/Compose/Dockerfile → `docs/operations/deployment.md`.
- Test harness/helpers (`vitest.setup.ts`, `src/test/**`) → `docs/operations/testing.md`.
- New feature area → add a `docs/features/*.md`, link it from `docs/README.md`, and from
  related docs.
