import { describe, it, expect } from "vitest";
import {
  sealSession,
  readSession,
  sealOidcTx,
  readOidcTx,
  SESSION_COOKIE,
} from "./session";

describe("session seal/unseal", () => {
  it("round-trips a session payload", async () => {
    const sealed = await sealSession({ userId: "u1", sub: "sub1", email: "e@x.co" });
    const data = await readSession(sealed);
    expect(data.userId).toBe("u1");
    expect(data.sub).toBe("sub1");
    expect(data.email).toBe("e@x.co");
  });

  it("returns {} for a missing cookie", async () => {
    expect(await readSession(undefined)).toEqual({});
  });

  it("returns {} for a tampered/invalid seal", async () => {
    expect(await readSession("not-a-valid-seal")).toEqual({});
  });

  it("exposes a stable cookie name", () => {
    expect(SESSION_COOKIE).toBe("jobflow_session");
  });
});

describe("oidc transaction cookie", () => {
  it("round-trips state/nonce/verifier/returnTo", async () => {
    const sealed = await sealOidcTx({ state: "st", nonce: "no", verifier: "ve", returnTo: "/x" });
    const tx = await readOidcTx(sealed);
    expect(tx).toMatchObject({ state: "st", nonce: "no", verifier: "ve", returnTo: "/x" });
  });

  it("returns null for a missing/invalid tx cookie", async () => {
    expect(await readOidcTx(undefined)).toBeNull();
    expect(await readOidcTx("garbage")).toBeNull();
  });
});
