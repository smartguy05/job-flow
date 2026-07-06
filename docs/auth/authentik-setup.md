# Authentik setup

How to configure Authentik as the OIDC provider for JobFlow. Field values map directly to
the env vars in [configuration](../operations/configuration.md); the flow they drive is in
[OIDC flow](oidc-flow.md).

Examples use `https://auth.example.com` for Authentik and `https://jobs.example.com` for
the app — substitute your own hosts.

## 1. Create the OAuth2/OpenID Provider

**Applications → Providers → Create → OAuth2/OpenID Provider.**

| Field | Value | Maps to / why |
|---|---|---|
| Name | `jobflow` | Internal label. |
| Authorization flow | `default-provider-authorization-explicit-consent` (or implicit) | Standard. |
| Client type | **Confidential** | The app sends a client secret. |
| Client ID | *(auto — copy)* | `OIDC_CLIENT_ID` |
| Client Secret | *(auto — copy)* | `OIDC_CLIENT_SECRET` |
| Redirect URIs | `https://jobs.example.com/api/auth/callback` **and** `https://jobs.example.com/login` — Strict | Login callback + post-logout redirect. |
| Signing Key | a certificate (built-in self-signed is fine) | **Required** — signs the `id_token` (RS256) so JWKS verification works. |
| **Encryption Key** | **leave empty** | If set, the `id_token` is an encrypted JWE and verification fails. See [troubleshooting](#troubleshooting). |
| Scopes | `openid`, `email`, `profile` mappings | App requests `openid profile email`; reads `sub`, `email`, `name`/`preferred_username`. |
| Subject mode | default (hashed user ID) | Stable `sub` — the per-user key. Don't change later. |

PKCE needs no special setting; the app always sends S256 and confidential + PKCE is fine.

## 2. Create the Application

**Applications → Applications → Create.**

| Field | Value | Why |
|---|---|---|
| Name | `JobFlow` | Dashboard label. |
| Slug | `jobflow` | **Defines the issuer**: `https://auth.example.com/application/o/jobflow/` → `OIDC_ISSUER`. |
| Provider | the `jobflow` provider | Binds them. |
| Launch URL | `https://jobs.example.com` | Optional. |

The slug determines the issuer path (`/application/o/<slug>/`). If you change it, update
`OIDC_ISSUER` to match.

## 3. Restrict access (optional)

Bind a group-membership policy on the Application to limit who can sign in — otherwise any
Authentik account is auto-provisioned as a JobFlow user on first login (see
`upsertUserBySub`).

## 4. Local development

To test at `http://localhost:3000`, add these to the provider's Redirect URIs too:

```
http://localhost:3000/api/auth/callback
http://localhost:3000/login
```

The callback URL is derived from `APP_BASE_URL`, so run the local instance with
`APP_BASE_URL=http://localhost:3000`. In dev (`npm run dev`, `NODE_ENV=development`) the
session cookie is non-Secure so plain `http://localhost` works; a bare LAN IP over http
will drop the Secure cookie in production mode. See [configuration](../operations/configuration.md).

## 5. Verify

```bash
curl -s https://auth.example.com/application/o/jobflow/.well-known/openid-configuration | jq .issuer
```

Then open the app → **Sign in with Authentik** → you should land back signed in.

## Troubleshooting

- **`We couldn't verify your identity` / server log `JWSInvalid: Invalid Compact JWS`** —
  the `id_token` is encrypted (a 5-segment JWE) instead of signed. **Clear the provider's
  Encryption Key** (keep the Signing Key). id_token encryption is unnecessary here: the
  token is exchanged server-to-server over TLS.
- **Redirect/`?error=state`** — the redirect URI or `post_logout_redirect_uri` isn't
  registered exactly (Strict match), or the tx cookie expired (>10 min between steps).
- **Trailing slash** — `OIDC_ISSUER` must match the discovery document's `issuer` exactly
  (Authentik uses a trailing slash).

## Related

- [OIDC flow](oidc-flow.md) · [Sessions & middleware](sessions-and-middleware.md) ·
  [Configuration](../operations/configuration.md) · [Deployment](../operations/deployment.md)
