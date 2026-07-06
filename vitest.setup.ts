// Runs before each test file (isolate: true → each file is its own process with fresh
// globals). Uses an embedded in-process Postgres (pglite) so every file gets an isolated
// DB, migrated + seeded with a test user here.

process.env.USE_PGLITE = "1";
process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-characters-long";
process.env.APP_BASE_URL ||= "http://localhost:3000";
process.env.OIDC_ISSUER ||= "https://authentik.test/application/o/jobflow";
process.env.OIDC_CLIENT_ID ||= "test-client";
process.env.OIDC_CLIENT_SECRET ||= "test-secret";

const { db, schema, runMigrations } = await import("@/db");
const { sealSession, SESSION_COOKIE } = await import("@/lib/auth/session");

await runMigrations();

const [user] = await db
  .insert(schema.users)
  .values({ sub: "test-user-sub", email: "tester@example.com", name: "Tester" })
  .returning();

globalThis.__testUserId = user.id;
globalThis.__testCookie = `${SESSION_COOKIE}=${await sealSession({
  userId: user.id,
  sub: user.sub,
  email: user.email ?? undefined,
  name: user.name ?? undefined,
})}`;
