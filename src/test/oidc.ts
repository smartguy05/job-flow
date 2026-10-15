import { vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from "jose";

// A fake Authentik for bearer-token tests: a local RS256 keypair per issuer whose public half
// is served as that issuer's JWKS, plus a stubbed global fetch that answers OIDC discovery
// and the JWKS URLs. Tokens are signed locally with jose — no network or real IdP.
export const TEST_ISSUER = "https://authentik.test/application/o/jobflow/";

export type TestIssuer = {
  issuer: string;
  sign: (
    claims?: JWTPayload,
    opts?: { issuer?: string; audience?: string | string[]; expiresIn?: string | number | null },
  ) => Promise<string>;
};

type Served = { discovery: Record<string, string>; jwk: JWK };
const served = new Map<string, Served>(); // keyed by "<issuer base>/.well-known/openid-configuration"
const jwksByUri = new Map<string, JWK>();

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const d = served.get(url);
      if (d) return Response.json(d.discovery);
      const jwk = jwksByUri.get(url);
      if (jwk) return Response.json({ keys: [jwk] });
      return new Response("not found", { status: 404 });
    }),
  );
}

// `issuer` must end with "/" (as Authentik's do). Call once per issuer per test file.
export async function installTestIssuer(issuer = TEST_ISSUER): Promise<TestIssuer> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const kid = `key-${served.size}`;
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  const jwksUri = `${issuer}jwks/`;
  const discovery = {
    issuer,
    authorization_endpoint: "https://authentik.test/application/o/authorize/",
    token_endpoint: "https://authentik.test/application/o/token/",
    jwks_uri: jwksUri,
  };
  served.set(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { discovery, jwk });
  jwksByUri.set(jwksUri, jwk);
  stubFetch();
  return {
    issuer,
    async sign(claims = { sub: "test-user-sub" }, opts = {}) {
      const jwt = new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuer(opts.issuer ?? issuer)
        .setAudience(opts.audience ?? process.env.OIDC_CLIENT_ID ?? "test-client")
        .setIssuedAt();
      // `expiresIn: null` omits `exp` entirely (to test that it is required).
      if (opts.expiresIn !== null) jwt.setExpirationTime(opts.expiresIn ?? "5m");
      return jwt.sign(privateKey);
    },
  };
}
