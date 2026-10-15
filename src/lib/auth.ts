import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession, SESSION_COOKIE, type SessionData } from "./auth/session";
import { verifyAccessToken } from "./auth/oidc";

// Route-handler & server-component auth helpers (Node runtime). The Edge middleware does
// NOT import this module — it reads the session cookie directly via `@/lib/auth/session`.

export type AuthedUser = { id: string; sub: string; email?: string; name?: string };

function toUser(data: SessionData): AuthedUser | null {
  if (!data.userId) return null;
  return { id: data.userId, sub: data.sub ?? "", email: data.email, name: data.name };
}

// Resolve the signed-in user from a route handler's NextRequest (testable without a Next
// request context, unlike next/headers cookies()).
export async function getUser(req: NextRequest): Promise<AuthedUser | null> {
  return toUser(await readSession(req.cookies.get(SESSION_COOKIE)?.value));
}

// Resolve the signed-in user inside a server component (layout/page), where the request
// is only reachable via next/headers cookies().
export async function currentUser(): Promise<AuthedUser | null> {
  const store = await cookies();
  return toUser(await readSession(store.get(SESSION_COOKIE)?.value));
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// Resolve the user behind an OAuth bearer token (the MCP endpoint). The token is verified
// against Authentik, then its `sub` is looked up in `users`. Users are NOT provisioned here:
// someone who has never signed in to the web app gets null (→ 401). Session cookies are
// deliberately ignored so the MCP endpoint only ever authenticates by token.
export async function getBearerUser(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return null;
  let sub: string;
  try {
    ({ sub } = await verifyAccessToken(match[1]));
  } catch {
    return null;
  }
  const [u] = await db.select().from(schema.users).where(eq(schema.users.sub, sub)).limit(1);
  if (!u) return null;
  return { id: u.id, sub: u.sub, email: u.email ?? undefined, name: u.name ?? undefined };
}
