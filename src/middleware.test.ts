import { describe, it, expect } from "vitest";
import { middleware } from "./middleware";
import { req, anonReq } from "@/test/req";

describe("auth middleware", () => {
  it("lets authenticated page requests through", async () => {
    const res = await middleware(req("/"));
    // NextResponse.next() has no redirect Location.
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("redirects unauthenticated page requests to /login with returnTo", async () => {
    const res = await middleware(anonReq("/applications/5?tab=x"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain("returnTo=");
    expect(decodeURIComponent(loc)).toContain("/applications/5?tab=x");
  });

  it("returns 401 for unauthenticated /api requests", async () => {
    const res = await middleware(anonReq("/api/applications"));
    expect(res.status).toBe(401);
  });

  it("exempts the auth flow, cron, and login page even when unauthenticated", async () => {
    for (const p of ["/api/auth/login", "/api/auth/callback", "/api/cron/reminders", "/login"]) {
      const res = await middleware(anonReq(p));
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.status, p).toBe(200);
    }
  });
});
