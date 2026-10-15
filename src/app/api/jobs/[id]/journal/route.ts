import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { listJournal, addJournalEntry } from "@/lib/services/journal";
import { errorResponse } from "@/lib/services/errors";

type Ctx = { params: Promise<{ id: string }> };

// Work journal for a job: achievements, feedback, complaints and notes (newest first).
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    return NextResponse.json(await listJournal(user.id, { jobId: parseInt((await ctx.params).id, 10) }));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const jobId = parseInt((await ctx.params).id, 10);
    return NextResponse.json(await addJournalEntry(user.id, jobId, await req.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
