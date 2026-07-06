# Sessions & middleware

How a signed-in identity is represented, read, and enforced. Pairs with the
[OIDC flow](oidc-flow.md), which creates the session.

## Session cookie (`src/lib/auth/session.ts`)

Sessions are **sealed (encrypted) cookies** via `iron-session`'s `sealData`/`unsealData` —
there is no server-side session store. This module is deliberately **Edge-safe**: it does
not import `next/headers` or the database, so the middleware can use it.

- Cookie name: `jobflow_session`; TTL 7 days.
- Payload (`SessionData`): `{ userId, sub, email?, name?, idToken? }`. `idToken` is kept
  only to support RP-initiated logout (`id_token_hint`).
- Options: `httpOnly`, `sameSite: "lax"` (so the cookie survives the top-level redirect
  back from the IdP), `secure` in production.
- `SESSION_SECRET` (≥32 chars) is the encryption password, validated lazily on first use.

Helpers: `sealSession(data)`, `readSession(sealed)` (returns `{}` when absent/invalid),
plus the short-lived OIDC transaction cookie helpers `sealOidcTx` / `readOidcTx`
(`jobflow_oidc_tx`, 10-minute TTL).

## Reading the user (`src/lib/auth.ts`)

Route handlers read the session **from the request**, not from `next/headers` — this keeps
handlers unit-testable without a Next request context.

- `getUser(req): AuthedUser | null` — unseal `req.cookies.get('jobflow_session')`.
- `currentUser(): AuthedUser | null` — for **server components** (e.g. `layout.tsx`), reads
  via `next/headers` `cookies()`.
- `unauthorized(): NextResponse` — the shared `401` JSON response.

`AuthedUser` is `{ id, sub, email?, name? }`; `id` is the internal `users.id` used to scope
every query. See [data model](../architecture/data-model.md).

### Route handler pattern

```ts
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  // ...scope all queries by user.id...
}
```

`[id]` routes additionally filter by `and(eq(table.id, id), eq(table.userId, user.id))` and
return **404** when not found (never 403). See [API reference](../api/reference.md).

## The gate (`src/middleware.ts`)

Runs on every request (matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and the
PWA asset routes `/manifest.webmanifest`, `/icon`, `/apple-icon`, `/icon.svg` — so the browser
can fetch the manifest/icons without a session, since the manifest link is requested without
credentials). It
does a **lightweight sealed-cookie check only** — no DB, no JWKS — because heavy id_token
verification already happened once at the callback; the 7-day session TTL is the trust
window.

Logic:

- **Public prefixes** — `/api/auth`, `/api/cron`, `/api/calendar/feed`, `/login` — pass
  through untouched. (`/api/cron` self-guards: `x-cron-secret` for POST, a user session for
  GET. `/api/calendar/feed` self-guards on a per-user `?token=` so external calendar clients
  can subscribe without a session; its token management stays at the session-guarded
  `/api/calendar/token`, deliberately outside this prefix. See
  [calendar](../features/calendar.md).)
- Valid session → continue.
- No session + `/api/*` → `401` JSON.
- No session + page → `307` redirect to `/login?returnTo=<path>`.

> Next 16 logs a deprecation notice suggesting the file be renamed `proxy.ts`. The
> `middleware.ts` convention still works; renaming is a cosmetic follow-up.

## UI touchpoints

- `src/app/login/page.tsx` — unauthenticated page with a "Sign in with Authentik" link to
  `/api/auth/login?returnTo=…`; shows an error hint from `?error=`.
- `src/app/layout.tsx` — server component; when `currentUser()` resolves, renders the nav,
  the signed-in email, and a `POST /api/auth/logout` sign-out form.

## Testing

Session helpers are unit-tested (seal/unseal round-trip, invalid cookie); middleware
decisions are tested with `req()` (authenticated) and `anonReq()` (unauthenticated) from
`@/test/req`. `vitest.setup.ts` seeds a test user and exposes `globalThis.__testCookie`.
See [testing](../operations/testing.md).

## Related

- [OIDC flow](oidc-flow.md) · [Authentik setup](authentik-setup.md) ·
  [Data model](../architecture/data-model.md) · [API reference](../api/reference.md)
