import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { addInterview } from "@/lib/services/interviews";
import { errorResponse } from "@/lib/services/errors";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const applicationId = parseInt((await ctx.params).id, 10);
  try {
    return NextResponse.json(await addInterview(user.id, applicationId, await req.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
