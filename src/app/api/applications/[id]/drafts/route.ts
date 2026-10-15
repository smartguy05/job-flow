import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { createDraft } from "@/lib/services/drafts";
import { NotFoundError, ValidationError, errorResponse } from "@/lib/services/errors";

export const maxDuration = 120;

// Generate a cover letter / recruiter reply / follow-up draft and store it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const applicationId = parseInt((await ctx.params).id, 10);
    const body = await req.json();
    return NextResponse.json(await createDraft(user.id, applicationId, { type: body.type || "reply", extra: body.extra }));
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ValidationError) return errorResponse(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
