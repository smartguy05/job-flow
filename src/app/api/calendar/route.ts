import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { getCalendarEvents } from "@/lib/calendar-data";

// Aggregates every dated item across the signed-in user's applications into a flat
// CalendarEvent list: scheduled interviews, application deadlines, and next-action dates.
// Read-only; the client (`/calendar`) handles month navigation and grouping. The same
// aggregation feeds the subscribable `.ics` route (`/api/calendar/feed`).
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(await getCalendarEvents(user.id));
}
