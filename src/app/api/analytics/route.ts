import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { getAnalytics } from "@/lib/services/analytics";

// Outcome analytics for the signed-in user. Aggregation lives in `src/lib/analytics.ts`.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(await getAnalytics(user.id));
}
