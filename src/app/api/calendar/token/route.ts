import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { regenerateCalendarToken } from "@/lib/calendar-data";

// Session-guarded management of the user's calendar-feed token. Deliberately lives at
// /api/calendar/token (NOT under the public /api/calendar/feed prefix) so the default
// middleware keeps it behind a session — and so the token is never settable through the
// unvalidated settings PUT.

function feedUrl(token: string): string {
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}/api/calendar/feed?token=${token}`;
}

// Report the current feed URL, or null if the feed has never been enabled.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const [row] = await db
    .select({ token: schema.users.calendarToken })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  return NextResponse.json({ url: row?.token ? feedUrl(row.token) : null });
}

// Enable the feed (or rotate the token), invalidating any previous subscription URL.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const token = await regenerateCalendarToken(user.id);
  return NextResponse.json({ url: feedUrl(token) });
}
