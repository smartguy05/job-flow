import { NextRequest, NextResponse } from "next/server";
import { createResumeForApplication } from "@/lib/resume-service";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 300;

// Generate a new tailored resume version for this application.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    const resumeId = await createResumeForApplication(user.id, id);
    return NextResponse.json({ resumeId });
  } catch (e) {
    const message = (e as Error).message;
    const status = message === "Application not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
