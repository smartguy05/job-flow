import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Hand-rolled OIDC authorization-code + PKCE flow against Authentik. jose does all JWT
// crypto (JWKS fetch + signature/claims verification). Node-runtime only (route handlers).

export type OidcConfig = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

// Discovery + JWKS caches, keyed by issuer base / jwks_uri. Normally there is one issuer
// (OIDC_ISSUER); MCP_OAUTH_ISSUER adds a second when MCP tokens come from a dedicated provider.
const configCache = new Map<string, { at: number; cfg: OidcConfig }>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1h

const trimSlash = (s: string) => s.replace(/\/$/, "");

function issuerBase(): string {
  const iss = process.env.OIDC_ISSUER;
  if (!iss) throw new Error("OIDC_ISSUER is required");
  return trimSlash(iss);
}

function clientId(): string {
  const id = process.env.OIDC_CLIENT_ID;
  if (!id) throw new Error("OIDC_CLIENT_ID is required");
  return id;
}

export async function getOidcConfig(issuer: string = issuerBase()): Promise<OidcConfig> {
  const base = trimSlash(issuer);
  const hit = configCache.get(base);
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.cfg;
  const res = await fetch(`${base}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const cfg = (await res.json()) as OidcConfig;
  configCache.set(base, { at: Date.now(), cfg });
  return cfg;
}

// One remote JWKS per jwks_uri (jose handles key rotation/refetch on unknown `kid`).
function getJwks(cfg: OidcConfig): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(cfg.jwks_uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(cfg.jwks_uri));
    jwksCache.set(cfg.jwks_uri, jwks);
  }
  return jwks;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// The app's public base URL. Redirects and the OIDC redirect URI derive from this, never
// from the request host — the app sits behind a Cloudflare Tunnel (internal host is http).
export function appBaseUrl(): string {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is required");
  return base.replace(/\/$/, "");
}

export function getRedirectUri(): string {
  return `${appBaseUrl()}/api/auth/callback`;
}

export function buildAuthorizeUrl(
  cfg: OidcConfig,
  opts: { state: string; nonce: string; challenge: string },
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: getRedirectUri(),
    scope: "openid profile email",
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
  });
  return `${cfg.authorization_endpoint}?${params.toString()}`;
}

// RP-initiated logout: send the browser to the IdP's end_session_endpoint so the Authentik
// session ends too. Returns null if the provider doesn't advertise the endpoint.
export function buildEndSessionUrl(
  cfg: OidcConfig,
  opts: { idToken?: string; postLogoutRedirectUri: string },
): string | null {
  if (!cfg.end_session_endpoint) return null;
  const params = new URLSearchParams({
    post_logout_redirect_uri: opts.postLogoutRedirectUri,
    client_id: clientId(),
  });
  if (opts.idToken) params.set("id_token_hint", opts.idToken);
  return `${cfg.end_session_endpoint}?${params.toString()}`;
}

export type TokenResponse = { id_token: string; access_token?: string; token_type?: string };

export async function exchangeCode(input: { code: string; verifier: string }): Promise<TokenResponse> {
  const cfg = await getOidcConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: getRedirectUri(),
    client_id: clientId(),
    client_secret: process.env.OIDC_CLIENT_SECRET ?? "",
    code_verifier: input.verifier,
  });
  const res = await fetch(cfg.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`OIDC token exchange failed: ${res.status}`);
  const json = (await res.json()) as TokenResponse;
  if (!json.id_token) throw new Error("OIDC token response missing id_token");
  return json;
}

export type IdClaims = { sub: string; email?: string; name?: string };

function str(v: JWTPayload[string]): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export async function verifyIdToken(idToken: string, opts: { nonce: string }): Promise<IdClaims> {
  const cfg = await getOidcConfig();
  const { payload } = await jwtVerify(idToken, getJwks(cfg), {
    issuer: cfg.issuer,
    audience: clientId(),
  });
  if (payload.nonce !== opts.nonce) throw new Error("OIDC nonce mismatch");
  if (!payload.sub) throw new Error("OIDC id_token missing sub");
  return {
    sub: String(payload.sub),
    email: str(payload.email),
    name: str(payload.name) ?? str(payload.preferred_username),
  };
}

// The issuer of MCP access tokens: the web app's provider by default, or a dedicated
// "JobFlow MCP" Authentik application (its own slug → its own issuer and signing key) when
// MCP_OAUTH_ISSUER is set. Also advertised as the authorization server in the MCP
// protected-resource metadata.
export function mcpIssuer(): string {
  const dedicated = process.env.MCP_OAUTH_ISSUER?.trim();
  if (dedicated) return dedicated;
  issuerBase(); // throws when OIDC_ISSUER is missing
  return process.env.OIDC_ISSUER!.trim();
}

// The audience(s) an MCP bearer token must carry. Authentik sets `aud` on its JWT access
// tokens to the provider's client ID, so this defaults to OIDC_CLIENT_ID (the web app's own
// provider). A dedicated "JobFlow MCP" provider sets MCP_OAUTH_AUDIENCE to its client ID; a
// comma-separated list accepts several.
export function accessTokenAudience(): string[] {
  const raw = process.env.MCP_OAUTH_AUDIENCE?.trim();
  if (!raw) return [clientId()];
  return raw.split(",").map((a) => a.trim()).filter(Boolean);
}

// Verify an OAuth access token presented as `Authorization: Bearer` (the MCP endpoint).
// JobFlow is the resource server; Authentik is the authorization server. Checks signature
// (provider JWKS), issuer (from discovery), audience and expiry. Throws on any failure.
export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  const cfg = await getOidcConfig(mcpIssuer());
  const { payload } = await jwtVerify(token, getJwks(cfg), {
    issuer: cfg.issuer,
    audience: accessTokenAudience(),
    // jose only checks `exp` when present; a bearer token must always expire.
    requiredClaims: ["exp"],
  });
  if (!payload.sub) throw new Error("access token missing sub");
  return { sub: String(payload.sub) };
}

// Only accept same-origin relative paths as post-login destinations (open-redirect guard).
export function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo || !returnTo.startsWith("/")) return "/";
  if (returnTo.startsWith("//") || returnTo.startsWith("/\\")) return "/";
  return returnTo;
}
