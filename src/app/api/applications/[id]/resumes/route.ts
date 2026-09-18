import { NextRequest, NextResponse } from "next/server";
import { copyResumeToApplication } from "@/lib/resume-service";
import { getUser, unauthorized } from "@/lib/auth";

// Attach a previously created resume (from any of the user's applications) to this
// application as a new draft version. Body: { sourceResumeId }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    const body = await req.json().catch(() => ({}));
    const sourceResumeId = parseInt(body.sourceResumeId, 10);
    if (!Number.isFinite(sourceResumeId)) {
      return NextResponse.json({ error: "sourceResumeId is required" }, { status: 400 });
    }
    const resumeId = await copyResumeToApplication(user.id, sourceResumeId, id);
    return NextResponse.json({ resumeId });
  } catch (e) {
    const message = (e as Error).message;
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
