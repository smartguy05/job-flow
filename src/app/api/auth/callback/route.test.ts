import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { anonReq } from "@/test/req";
import { sealOidcTx, OIDC_TX_COOKIE, SESSION_COOKIE, readSession } from "@/lib/auth/session";

// Mock the network-bound OIDC bits; keep the pure helpers (appBaseUrl, sanitizeReturnTo) real.
vi.mock("@/lib/auth/oidc", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/oidc")>();
  return {
    ...actual,
    exchangeCode: vi.fn(async () => ({ id_token: "idtok" })),
    verifyIdToken: vi.fn(async () => ({ sub: "cb-sub", email: "cb@example.com", name: "CB" })),
  };
});

import { GET } from "./route";

function withTx(url: string, tx: { state: string; nonce: string; verifier: string; returnTo: string }) {
  return sealOidcTx(tx).then((sealed) => anonReq(url, "GET", undefined, { cookie: `${OIDC_TX_COOKIE}=${sealed}` }));
}

describe("GET /api/auth/callback", () => {
  it("redirects to /login?error=state on state mismatch", async () => {
    const res = await GET(await withTx("/api/auth/callback?code=abc&state=WRONG", {
      state: "expected",
      nonce: "n",
      verifier: "v",
      returnTo: "/",
    }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?error=state");
  });

  it("provisions the user, sets a session cookie, and redirects to returnTo", async () => {
    const res = await GET(await withTx("/api/auth/callback?code=abc&state=st", {
      state: "st",
      nonce: "n",
      verifier: "v",
      returnTo: "/applications/1",
    }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/applications/1");

    const data = await readSession(res.cookies.get(SESSION_COOKIE)?.value);
    expect(data.sub).toBe("cb-sub");
    expect(data.userId).toBeTruthy();

    const [u] = await db.select().from(schema.users).where(eq(schema.users.sub, "cb-sub")).limit(1);
    expect(u?.email).toBe("cb@example.com");
  });
});
