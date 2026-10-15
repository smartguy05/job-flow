import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/services/errors";
import { getPtoSummary } from "@/lib/services/career-growth";

// PTO balance for a calendar year against the job's benefits allowance. ?year=YYYY (default
// this year).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const jobId = parseInt((await ctx.params).id, 10);
    const y = req.nextUrl.searchParams.get("year");
    return NextResponse.json(await getPtoSummary(user.id, jobId, y === null ? undefined : Number(y)));
  } catch (e) {
    return errorResponse(e);
  }
}
