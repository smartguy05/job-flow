import { NextRequest, NextResponse } from "next/server";
import {
  getOidcConfig,
  buildAuthorizeUrl,
  randomToken,
  codeChallenge,
  sanitizeReturnTo,
} from "@/lib/auth/oidc";
import { sealOidcTx, OIDC_TX_COOKIE, oidcTxCookieOptions } from "@/lib/auth/session";

// Begin the OIDC authorization-code + PKCE flow: stash state/nonce/verifier in a sealed
// short-lived cookie and redirect to Authentik.
export async function GET(req: NextRequest) {
  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const challenge = codeChallenge(verifier);

  const cfg = await getOidcConfig();
  const authorizeUrl = buildAuthorizeUrl(cfg, { state, nonce, challenge });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(OIDC_TX_COOKIE, await sealOidcTx({ state, nonce, verifier, returnTo }), oidcTxCookieOptions());
  return res;
}
