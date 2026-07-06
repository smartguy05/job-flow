# OIDC flow

Hand-rolled OpenID Connect **authorization-code flow with PKCE** against Authentik.
`jose` does all JWT crypto; no OIDC client library. Implemented in `src/lib/auth/oidc.ts`
and the routes under `src/app/api/auth/`.

For provider configuration see [Authentik setup](authentik-setup.md); for the cookie/gate
mechanics see [sessions & middleware](sessions-and-middleware.md).

## Endpoints

| Route | File | Purpose |
|---|---|---|
| `GET /api/auth/login` | `app/api/auth/login/route.ts` | Start the flow; redirect to the IdP. |
| `GET /api/auth/callback` | `app/api/auth/callback/route.ts` | Finish the flow; set the session. |
| `POST /api/auth/logout` | `app/api/auth/logout/route.ts` | RP-initiated logout. |

## Discovery

`getOidcConfig()` fetches `${OIDC_ISSUER}/.well-known/openid-configuration` and memoizes it
(1h TTL). `OIDC_ISSUER` is the issuer **without** the well-known suffix (e.g.
`https://auth.example.com/application/o/jobflow/`). JWKS keys are fetched lazily via
`createRemoteJWKSet(jwks_uri)`.

## Login (`/api/auth/login`)

1. Sanitize `returnTo` (same-origin relative paths only — `sanitizeReturnTo`).
2. Generate `state`, `nonce`, and a PKCE `verifier`; compute the S256 `code_challenge`.
3. Seal `{ state, nonce, verifier, returnTo }` into the short-lived `jobflow_oidc_tx`
   cookie (10-minute TTL).
4. Redirect to the authorize endpoint with `scope=openid profile email`,
   `code_challenge_method=S256`, and `redirect_uri` derived from `APP_BASE_URL`.

**Redirect URI** is always `${APP_BASE_URL}/api/auth/callback` — derived from config, never
the request host (the app sits behind a Cloudflare Tunnel). See
[configuration](../operations/configuration.md).

## Callback (`/api/auth/callback`)

1. Read the `jobflow_oidc_tx` cookie; if it's missing or `state` doesn't match →
   redirect to `/login?error=state` (CSRF protection).
2. `exchangeCode({ code, verifier })` POSTs to the token endpoint with the client secret
   and PKCE verifier.
3. `verifyIdToken(id_token, { nonce })` verifies with `jose.jwtVerify` against the JWKS,
   pinning `issuer` (from discovery) and `audience` (the client ID), then asserts the
   `nonce` matches.
4. `upsertUserBySub({ sub, email, name })` provisions or refreshes the user
   (`src/lib/auth/users.ts`) and returns the internal `users.id`.
5. Set the `jobflow_session` cookie (includes the `id_token` for logout), clear the tx
   cookie, and redirect to the sanitized `returnTo`.

On any exception the handler logs server-side and redirects to `/login?error=auth`.

## Logout (`/api/auth/logout`, RP-initiated)

`POST` reads the session's stored `id_token`, then redirects to the provider's
`end_session_endpoint` with `id_token_hint` + `post_logout_redirect_uri`
(`${APP_BASE_URL}/login`) and clears the local session cookie — ending the Authentik
session too. If discovery is unreachable or the provider advertises no end-session
endpoint, it falls back to a local-only logout to `/login`.

> The IdP validates `post_logout_redirect_uri`, so `${APP_BASE_URL}/login` must be
> registered as a redirect URI in Authentik. See [Authentik setup](authentik-setup.md).

## Security checklist (all enforced)

- **state** — random, sealed in the tx cookie, compared on callback.
- **nonce** — random, embedded in the request, asserted against the `id_token`.
- **PKCE** — S256; verifier only ever in the sealed tx cookie.
- **id_token** — signature via JWKS, plus `issuer`/`audience` pinning and `exp` (jose).
- **redirect URI** — from `APP_BASE_URL`, never the request host.
- **returnTo** — sanitized to same-origin relative paths (no `//`, `/\`, absolute URLs).

## Gotcha: id_token must be signed, not encrypted

`jose.jwtVerify` expects a signed JWT (JWS, 3 segments). If the Authentik provider has an
**Encryption Key** set, it issues an encrypted JWE (5 segments) and verification fails with
`JWSInvalid: Invalid Compact JWS`. Fix: clear the provider's Encryption Key (keep the
Signing Key). See [Authentik setup](authentik-setup.md#troubleshooting).

## Related

- [Sessions & middleware](sessions-and-middleware.md) · [Authentik setup](authentik-setup.md) ·
  [Configuration](../operations/configuration.md) · [API reference](../api/reference.md)
