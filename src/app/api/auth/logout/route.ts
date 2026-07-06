import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl, getOidcConfig, buildEndSessionUrl } from "@/lib/auth/oidc";
import { SESSION_COOKIE, sessionCookieOptions, readSession } from "@/lib/auth/session";

// Clear the local session AND end the Authentik session (RP-initiated logout). Falls back
// to local-only logout if the provider doesn't advertise an end_session_endpoint or
// discovery is unreachable.
export async function POST(req: NextRequest) {
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const postLogout = new URL("/login", appBaseUrl()).toString();

  let target = postLogout;
  try {
    const cfg = await getOidcConfig();
    const endSession = buildEndSessionUrl(cfg, { idToken: session.idToken, postLogoutRedirectUri: postLogout });
    if (endSession) target = endSession;
  } catch {
    // Discovery unavailable — clear locally and go to /login.
  }

  const res = NextResponse.redirect(target, { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
