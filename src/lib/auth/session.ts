import { sealData, unsealData } from "iron-session";

// Edge-safe session primitives. This module must NOT import `next/headers` or `@/db`
// so it can be pulled into the Edge middleware bundle. All session reads/writes go
// through the sealed cookie value directly (works in route handlers, middleware, and
// unit tests that call handlers without a Next request context).

export type SessionData = {
  userId?: string; // internal users.id (uuid)
  sub?: string; // OIDC subject
  email?: string;
  name?: string;
  idToken?: string; // kept for RP-initiated logout (id_token_hint)
};

export const SESSION_COOKIE = "jobflow_session";
export const OIDC_TX_COOKIE = "jobflow_oidc_tx";

export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days (seconds)
export const OIDC_TX_TTL = 60 * 10; // 10 minutes (seconds)

// The iron-session encryption password. Validated lazily (not at import) so the Edge
// middleware can import cookie names / option builders without tripping on env at load.
export function sessionPassword(): string {
  const p = process.env.SESSION_SECRET;
  if (!p || p.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return p;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, // sent on the top-level redirect back from the IdP
    path: "/",
    maxAge: SESSION_TTL,
  };
}

// Seal a session payload into a cookie value.
export function sealSession(data: SessionData): Promise<string> {
  return sealData(data, { password: sessionPassword(), ttl: SESSION_TTL });
}

// Read + verify a session from a raw sealed cookie value. Returns {} when absent/invalid.
export async function readSession(sealed: string | undefined): Promise<SessionData> {
  if (!sealed) return {};
  try {
    return await unsealData<SessionData>(sealed, { password: sessionPassword(), ttl: SESSION_TTL });
  } catch {
    return {};
  }
}

// --- Short-lived OIDC transaction cookie (state / nonce / PKCE verifier / returnTo) ---

export type OidcTx = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
};

export function sealOidcTx(tx: OidcTx): Promise<string> {
  return sealData(tx, { password: sessionPassword(), ttl: OIDC_TX_TTL });
}

export async function readOidcTx(sealed: string | undefined): Promise<OidcTx | null> {
  if (!sealed) return null;
  try {
    const tx = await unsealData<OidcTx>(sealed, { password: sessionPassword(), ttl: OIDC_TX_TTL });
    return tx.state ? tx : null;
  } catch {
    return null;
  }
}

export function oidcTxCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OIDC_TX_TTL,
  };
}
