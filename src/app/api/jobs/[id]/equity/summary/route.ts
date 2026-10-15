import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/services/errors";
import { getEquitySummary } from "@/lib/services/career-growth";

// Vested / unvested / next vest for this job's grants. ?asOf=YYYY-MM-DD (default today).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const jobId = parseInt((await ctx.params).id, 10);
    const asOf = req.nextUrl.searchParams.get("asOf") ?? undefined;
    return NextResponse.json(await getEquitySummary(user.id, { jobId, asOf }));
  } catch (e) {
    return errorResponse(e);
  }
}
