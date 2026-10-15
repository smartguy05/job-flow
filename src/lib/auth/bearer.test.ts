import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { installTestIssuer, type TestIssuer } from "@/test/oidc";
import { seedUser } from "@/test/req";
import { getBearerUser } from "@/lib/auth";

let issuer: TestIssuer;
beforeAll(async () => {
  issuer = await installTestIssuer();
});

const withAuth = (value?: string) =>
  new NextRequest("http://localhost/api/mcp", { method: "POST", headers: value ? { authorization: value } : {} });

describe("getBearerUser", () => {
  it("resolves an existing user from a valid bearer token", async () => {
    const token = await issuer.sign({ sub: "test-user-sub" });
    const user = await getBearerUser(withAuth(`Bearer ${token}`));
    expect(user?.id).toBe(globalThis.__testUserId);
    expect(user?.sub).toBe("test-user-sub");
  });

  it("maps each sub to its own user", async () => {
    const other = await seedUser("other-bearer-sub");
    const token = await issuer.sign({ sub: "other-bearer-sub" });
    expect((await getBearerUser(withAuth(`Bearer ${token}`)))?.id).toBe(other.id);
  });

  it("returns null for a sub that never signed in to the web app (no auto-provisioning)", async () => {
    const token = await issuer.sign({ sub: "never-seen-sub" });
    expect(await getBearerUser(withAuth(`Bearer ${token}`))).toBeNull();
  });

  it("returns null without a header, with a non-bearer scheme, or with a bad token", async () => {
    expect(await getBearerUser(withAuth())).toBeNull();
    expect(await getBearerUser(withAuth("Basic dXNlcjpwYXNz"))).toBeNull();
    expect(await getBearerUser(withAuth("Bearer "))).toBeNull();
    expect(await getBearerUser(withAuth("Bearer not-a-jwt"))).toBeNull();
    const wrongAud = await issuer.sign({ sub: "test-user-sub" }, { audience: "nope" });
    expect(await getBearerUser(withAuth(`Bearer ${wrongAud}`))).toBeNull();
  });

  it("does not accept the session cookie as a bearer substitute", async () => {
    const r = new NextRequest("http://localhost/api/mcp", { headers: { cookie: globalThis.__testCookie } });
    expect(await getBearerUser(r)).toBeNull();
  });
});
