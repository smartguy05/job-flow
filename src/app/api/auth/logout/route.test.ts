import { describe, it, expect, vi } from "vitest";
import { anonReq } from "@/test/req";
import { sealSession, SESSION_COOKIE, readSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/oidc", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/oidc")>();
  return { ...actual, getOidcConfig: vi.fn() };
});

import { getOidcConfig } from "@/lib/auth/oidc";
import { POST } from "./route";

const cfg = {
  issuer: "https://authentik.test/application/o/jobflow",
  authorization_endpoint: "https://authentik.test/authorize",
  token_endpoint: "https://authentik.test/token",
  jwks_uri: "https://authentik.test/jwks",
  end_session_endpoint: "https://authentik.test/end-session",
};

async function reqWithSession(idToken?: string) {
  const sealed = await sealSession({ userId: "u1", sub: "s1", idToken });
  return anonReq("/api/auth/logout", "POST", undefined, { cookie: `${SESSION_COOKIE}=${sealed}` });
}

describe("POST /api/auth/logout", () => {
  it("redirects to the IdP end_session endpoint with id_token_hint and clears the cookie", async () => {
    vi.mocked(getOidcConfig).mockResolvedValue(cfg);
    const res = await POST(await reqWithSession("the-id-token"));
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://authentik.test/end-session");
    expect(loc.searchParams.get("id_token_hint")).toBe("the-id-token");
    expect(loc.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:3000/login");
    // session cookie is cleared
    const cleared = res.cookies.get(SESSION_COOKIE);
    expect(cleared?.value).toBe("");
    expect(await readSession(cleared?.value)).toEqual({});
  });

  it("falls back to local /login logout when discovery is unavailable", async () => {
    vi.mocked(getOidcConfig).mockRejectedValue(new Error("unreachable"));
    const res = await POST(await reqWithSession("tok"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe("");
  });

  it("falls back to /login when the provider has no end_session_endpoint", async () => {
    vi.mocked(getOidcConfig).mockResolvedValue({ ...cfg, end_session_endpoint: undefined });
    const res = await POST(await reqWithSession("tok"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
