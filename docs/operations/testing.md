# Testing

TDD is mandatory (see the repo-root `CLAUDE.md`). Tests use **Vitest** with an in-process
Postgres (**pglite**), so no external database is needed.

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # coverage report
npm run build         # also type-checks
```

## Harness (`vitest.setup.ts`)

Runs before each test file. With `isolate: true` (`vitest.config.ts`), each file is its own
process, so each gets a fresh in-memory pglite DB. Setup:

1. Sets `USE_PGLITE=1` and test values for `SESSION_SECRET`, `APP_BASE_URL`, and the
   `OIDC_*` vars (so modules that read them don't throw).
2. `await runMigrations()` — applies the real `drizzle/` migrations (see
   [database layer](../architecture/database.md)).
3. Seeds one test user and exposes `globalThis.__testUserId` and `globalThis.__testCookie`
   (a sealed session cookie for that user).

## Helpers (`src/test/req.ts`)

- `req(url, method?, body?, headers?)` — `NextRequest` **authenticated** as the seeded
  user (attaches the session cookie).
- `anonReq(...)` — an **unauthenticated** request (for asserting `401`).
- `ctx(id)` — the `{ params }` context for `[id]` route handlers.
- `insertApp(over?)` — **async**; inserts an application owned by the test user, returns its id.
- `seedUser(sub)` — **async**; creates a second user and returns `{ id, cookie, req }` for
  cross-tenant isolation tests.

## Bearer-token helper (`src/test/oidc.ts`)

`installTestIssuer(issuer?)` creates a local RS256 keypair and stubs global `fetch`, so the
issuer's OIDC discovery document and JWKS are served from memory. It returns
`{ issuer, sign(claims?, { issuer?, audience?, expiresIn? }) }`, which mints access tokens
with jose. The default issuer matches `OIDC_ISSUER` from the setup, and the default
audience is `OIDC_CLIENT_ID`. Call it again with another issuer to simulate a dedicated MCP
provider. The [MCP](../features/mcp.md) route, `getBearerUser` and `verifyAccessToken`
tests use it. No real Authentik is ever contacted.

MCP tool handlers are tested with `callTool(name, userId, args)` from
`src/lib/mcp/registry.ts`, which runs the zod input schema and then the handler.

## Conventions

- **Async DB API** — `await db.select()...`; single row via `const [x] = await …limit(1)`.
  No `.get()/.all()/.run()`.
- **Scope inserts** — direct inserts into user-owned tables must set `userId`
  (`globalThis.__testUserId`).
- **Mock the LLM layer** — `vi.mock("@/lib/llm")` or `@/lib/llm-provider`; never call a real
  model API. Mocked signatures take the current args (e.g. `userId` first).
- **Auth coverage** — new routes should assert `401` (via `anonReq`) and, for `[id]`
  routes, cross-tenant `404` (via `seedUser`). See
  [sessions & middleware](../auth/sessions-and-middleware.md).
- **Rendering tests** — `render-resume` runs real `soffice`/`pdfinfo` and asserts on
  returned `Buffer`s + page count.

## Coverage

Target **≥70% (goal 80%)** on `src/lib`, `src/db`, `src/app/api` (config in
`vitest.config.ts`; `src/db/schema.ts` and presentational components are excluded). Run
`npm run test:coverage` before considering work done.

## Related

- [Database layer](../architecture/database.md) · [Sessions & middleware](../auth/sessions-and-middleware.md) ·
  [API reference](../api/reference.md) · [Service layer](../architecture/service-layer.md) ·
  [MCP server](../features/mcp.md)
