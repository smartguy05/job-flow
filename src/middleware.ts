import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";

// Public paths. `/api/cron` is exempt because it self-guards (x-cron-secret for POST, a
// user session for GET); `/api/auth` is the login flow; `/login` is the sign-in page;
// `/api/calendar/feed` self-guards with a per-user token so external calendar clients (which
// can't do the OIDC login) can subscribe — token management stays at the session-guarded
// `/api/calendar/token`, deliberately outside this prefix.
const PUBLIC_PREFIXES = ["/api/auth", "/api/cron", "/api/calendar/feed", "/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session.userId) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("returnTo", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next's static assets, the favicon, and the PWA asset routes
  // (manifest + generated icons + icon.svg) so the browser can fetch them without a session
  // — the manifest link is requested without credentials, even on the login page.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|icon.svg).*)",
  ],
};
