import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { anonReq } from "@/test/req";
import { OIDC_TX_COOKIE } from "@/lib/auth/session";

const discovery = {
  issuer: "https://authentik.test/application/o/jobflow",
  authorization_endpoint: "https://authentik.test/authorize",
  token_endpoint: "https://authentik.test/token",
  jwks_uri: "https://authentik.test/jwks",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => discovery })) as unknown as typeof fetch,
  );
});

describe("GET /api/auth/login", () => {
  it("redirects to the IdP authorize endpoint and sets a sealed tx cookie", async () => {
    const res = await GET(anonReq("/api/auth/login?returnTo=/applications/3"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://authentik.test/authorize");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("state")).toBeTruthy();
    expect(loc.searchParams.get("nonce")).toBeTruthy();
    expect(res.cookies.get(OIDC_TX_COOKIE)?.value).toBeTruthy();
  });
});
