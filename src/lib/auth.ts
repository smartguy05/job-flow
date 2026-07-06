import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE, type SessionData } from "./auth/session";

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
