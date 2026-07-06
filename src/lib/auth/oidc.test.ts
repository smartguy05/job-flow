import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { sanitizeReturnTo, codeChallenge, randomToken, buildAuthorizeUrl, getRedirectUri } from "./oidc";

describe("sanitizeReturnTo", () => {
  it("passes through same-origin relative paths", () => {
    expect(sanitizeReturnTo("/applications/5")).toBe("/applications/5");
    expect(sanitizeReturnTo("/?x=1")).toBe("/?x=1");
  });
  it("rejects protocol-relative and absolute and backslash tricks", () => {
    expect(sanitizeReturnTo("//evil.com")).toBe("/");
    expect(sanitizeReturnTo("/\\evil.com")).toBe("/");
    expect(sanitizeReturnTo("https://evil.com")).toBe("/");
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/");
  });
  it("defaults to / for empty/null", () => {
    expect(sanitizeReturnTo(null)).toBe("/");
    expect(sanitizeReturnTo(undefined)).toBe("/");
    expect(sanitizeReturnTo("")).toBe("/");
  });
});

describe("PKCE", () => {
  it("codeChallenge is base64url(SHA-256(verifier))", () => {
    const verifier = "test-verifier-value";
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(codeChallenge(verifier)).toBe(expected);
  });
  it("randomToken produces urlsafe strings of adequate length", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(randomToken()).not.toBe(t);
  });
});

describe("buildAuthorizeUrl / getRedirectUri", () => {
  const cfg = {
    issuer: "https://authentik.test/application/o/jobflow",
    authorization_endpoint: "https://authentik.test/authorize",
    token_endpoint: "https://authentik.test/token",
    jwks_uri: "https://authentik.test/jwks",
  };

  it("builds a spec-compliant authorize URL with PKCE + state + nonce", () => {
    const url = new URL(buildAuthorizeUrl(cfg, { state: "st", nonce: "no", challenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://authentik.test/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("nonce")).toBe("no");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(getRedirectUri());
  });

  it("derives the redirect URI from APP_BASE_URL", () => {
    // vitest.setup.ts sets APP_BASE_URL=http://localhost:3000
    expect(getRedirectUri()).toBe("http://localhost:3000/api/auth/callback");
  });
});
