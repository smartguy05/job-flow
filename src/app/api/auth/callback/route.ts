import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl, exchangeCode, verifyIdToken, sanitizeReturnTo } from "@/lib/auth/oidc";
import { upsertUserBySub } from "@/lib/auth/users";
import {
  sealSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  readOidcTx,
  OIDC_TX_COOKIE,
  oidcTxCookieOptions,
} from "@/lib/auth/session";

function loginError(reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, appBaseUrl()));
}

// Complete the OIDC flow: verify state, exchange the code, verify the id_token, provision
// the user, and set the session cookie.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return loginError(params.get("error") as string);

  const code = params.get("code");
  const state = params.get("state");
  const tx = await readOidcTx(req.cookies.get(OIDC_TX_COOKIE)?.value);
  if (!tx || !code || !state || state !== tx.state) return loginError("state");

  try {
    const tokens = await exchangeCode({ code, verifier: tx.verifier });
    const claims = await verifyIdToken(tokens.id_token, { nonce: tx.nonce });
    const userId = await upsertUserBySub({ sub: claims.sub, email: claims.email, name: claims.name });

    const res = NextResponse.redirect(new URL(sanitizeReturnTo(tx.returnTo), appBaseUrl()));
    res.cookies.set(
      SESSION_COOKIE,
      await sealSession({
        userId,
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        idToken: tokens.id_token,
      }),
      sessionCookieOptions(),
    );
    res.cookies.set(OIDC_TX_COOKIE, "", { ...oidcTxCookieOptions(), maxAge: 0 });
    return res;
  } catch (e) {
    console.error("[auth callback] verification failed:", e);
    return loginError("auth");
  }
}
