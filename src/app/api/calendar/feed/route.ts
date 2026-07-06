import { NextRequest, NextResponse } from "next/server";
import { findUserIdByCalendarToken, getCalendarEvents } from "@/lib/calendar-data";
import { toICS } from "@/lib/calendar";

// Public, subscribable iCalendar feed for a single user. Exempt from the session middleware
// (see PUBLIC_PREFIXES in src/middleware.ts) because external calendar clients cannot do the
// OIDC login — it self-guards with an unguessable per-user token instead, mirroring the
// self-guard convention used by /api/cron.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const userId = await findUserIdByCalendarToken(token);
  // 404 (not 401) so a bad token is indistinguishable from a non-existent resource.
  if (!userId) return new NextResponse("Not found", { status: 404 });

  const events = await getCalendarEvents(userId);
  const ics = toICS(events, { baseUrl: process.env.APP_BASE_URL });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="jobflow.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
