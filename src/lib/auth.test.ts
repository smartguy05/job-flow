import { describe, it, expect } from "vitest";
import { getUser, unauthorized } from "./auth";
import { req, anonReq } from "@/test/req";

describe("getUser", () => {
  it("resolves the signed-in user from the session cookie", async () => {
    const user = await getUser(req("/api/anything"));
    expect(user?.id).toBe(globalThis.__testUserId);
  });

  it("returns null without a session cookie", async () => {
    expect(await getUser(anonReq("/api/anything"))).toBeNull();
  });
});

describe("unauthorized", () => {
  it("returns a 401 JSON response", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});
