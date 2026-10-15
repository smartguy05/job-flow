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

## 6. MCP connector (Claude)

The [MCP server](../features/mcp.md) at `/api/mcp` accepts Authentik-issued OAuth **access
tokens**. Authentik is the authorization server, and Claude is the OAuth client.

**What Authentik puts in the access token.** For authorization-code grants, an OAuth2/OpenID
provider issues the access token as a **JWT**, signed with the provider's **Signing Key**
(served at `…/application/o/<slug>/jwks/`). Its claims mirror the id_token:
- `iss` is the provider's issuer (`…/application/o/<slug>/` in the default per-provider
  issuer mode);
- `sub` follows the provider's subject mode;
- `aud` is the provider's **Client ID**.

JobFlow checks signature, `iss`, `aud` and `exp` (`verifyAccessToken`). Check this on your
own Authentik version by decoding a token (`jq -R 'split(".")[1] | @base64d | fromjson'`).
If `aud` differs there, set `MCP_OAUTH_AUDIENCE` to the value you see.

**Claude's callback.** The hosted Claude apps (claude.ai, Desktop, mobile, Cowork) use the
fixed redirect URI `https://claude.ai/api/mcp/auth_callback`. Claude Code uses an RFC 8252
loopback redirect, `http://localhost:<port>/callback`. Authentik offers no dynamic client
registration, so the user pastes the client ID and secret into the connector's advanced
settings.

### Option A: reuse the web provider (simplest)

On the `jobflow` provider:

| Field | Add |
|---|---|
| Redirect URIs | `https://claude.ai/api/mcp/auth_callback` (Strict). For Claude Code, also add the Regex `http://(localhost\|127\.0\.0\.1):\d+/callback`, or a Strict `http://localhost:<fixed port>/callback`. |
| Scopes | Add the **`offline_access`** mapping (`authentik default OAuth Mapping: OpenID 'offline_access'`). Claude asks for it, and without it there is no refresh token. |
| Access token validity | Optional. The default is 5 minutes, and with refresh tokens Claude renews silently. |
| Encryption Key | Must stay **empty**, as for the id_token. An encrypted (JWE) access token can't be verified. |

No env change is needed: the audience defaults to `OIDC_CLIENT_ID`, and the issuer to
`OIDC_ISSUER`.

### Option B: a dedicated "JobFlow MCP" provider

This keeps the MCP client separate, for example to revoke it independently.

1. Create a second OAuth2/OpenID provider with the redirect URIs and `offline_access` scope
   from Option A, a Signing Key, and no Encryption Key.
2. Set its **Subject mode to the same value as the web provider**. JobFlow maps `sub` to the
   user who signed in on the web, so a different mode makes everyone unknown (`401`).
3. Create an Application for it, for example with slug `jobflow-mcp`, so its issuer is
   `https://auth.example.com/application/o/jobflow-mcp/`.
4. Set `MCP_OAUTH_ISSUER` to that issuer, and `MCP_OAUTH_AUDIENCE` to the new Client ID.
   The issuer is advertised in `/.well-known/oauth-protected-resource`, and tokens are
   verified against its JWKS. See [configuration](../operations/configuration.md).

Either way, bind the same access policy as the web application if you restrict sign-in
(step 3). A person must have signed in to the web app once before MCP works for them.

## Troubleshooting

- **`We couldn't verify your identity` / server log `JWSInvalid: Invalid Compact JWS`** —
  the `id_token` is encrypted (a 5-segment JWE) instead of signed. **Clear the provider's
  Encryption Key** (keep the Signing Key). id_token encryption is unnecessary here: the
  token is exchanged server-to-server over TLS.
- **Redirect/`?error=state`** — the redirect URI or `post_logout_redirect_uri` isn't
  registered exactly (Strict match), or the tx cookie expired (>10 min between steps).
- **MCP connector says authorization failed / every MCP call is 401.** Check the
  following:
  - the token's `aud` must match `MCP_OAUTH_AUDIENCE` (default `OIDC_CLIENT_ID`);
  - `iss` must match `MCP_OAUTH_ISSUER`/`OIDC_ISSUER` discovery;
  - the person must have signed in to the web app once;
  - with Option B, both providers must use the same subject mode;
  - the redirect URI must be registered exactly (`https://claude.ai/api/mcp/auth_callback`).
- **Trailing slash** — `OIDC_ISSUER` must match the discovery document's `issuer` exactly
  (Authentik uses a trailing slash).

## Related

- [OIDC flow](oidc-flow.md) · [Sessions & middleware](sessions-and-middleware.md) ·
  [Configuration](../operations/configuration.md) · [Deployment](../operations/deployment.md) ·
  [MCP server](../features/mcp.md)
