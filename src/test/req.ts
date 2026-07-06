import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { sealSession, SESSION_COOKIE } from "@/lib/auth/session";

// Build a NextRequest for calling route handlers directly in tests. Authenticated as the
// seeded test user by default (attaches its session cookie); pass a `cookie` header to
// override, or use `anonReq` for the unauthenticated case.
export function req(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", cookie: globalThis.__testCookie ?? "", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// An unauthenticated request (no session cookie) — for asserting 401s.
export function anonReq(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// Route context for dynamic [id] segments.
export const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

// Create an additional user and return its id + a request-builder scoped to it.
// Used for cross-tenant isolation tests.
export async function seedUser(sub: string): Promise<{ id: string; cookie: string; req: typeof req }> {
  const [u] = await db
    .insert(schema.users)
    .values({ sub, email: `${sub}@example.com`, name: sub })
    .returning();
  const cookie = `${SESSION_COOKIE}=${await sealSession({ userId: u.id, sub: u.sub, email: u.email ?? undefined })}`;
  const scopedReq: typeof req = (url, method = "GET", body?, headers = {}) =>
    req(url, method, body, { cookie, ...headers });
  return { id: u.id, cookie, req: scopedReq };
}

// Insert an application directly (owned by the seeded test user) and return its id.
export async function insertApp(
  over: Partial<typeof schema.applications.$inferInsert> = {},
): Promise<number> {
  const now = new Date();
  const [row] = await db
    .insert(schema.applications)
    .values({
      userId: globalThis.__testUserId,
      company: "Globex Corp",
      companyNormalized: "globex",
      roleTitle: "AI Engineer",
      status: "applied",
      jdSnapshot: "jd",
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
      ...over,
    })
    .returning({ id: schema.applications.id });
  return row.id;
}
