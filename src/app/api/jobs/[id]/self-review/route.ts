import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { errorResponse, NotFoundError, ValidationError } from "@/lib/services/errors";
import { draftJobSelfReview } from "@/lib/services/career-growth";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Draft a self-review from the job's brag doc. Body { from?, to?, cycle? }. Returns
// { draft, bragDoc }; nothing is saved. Only the brag doc reaches the LLM.
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const result = await draftJobSelfReview(user.id, parseInt((await ctx.params).id, 10), {
      from: str(body.from),
      to: str(body.to),
      cycle: str(body.cycle),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ValidationError) return errorResponse(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
