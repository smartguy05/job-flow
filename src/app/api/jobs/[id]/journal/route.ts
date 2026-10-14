import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { journalInput } from "@/lib/job-input";
import { getOwnedJob, serializeTech, todayISO } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

// Work journal for a job: achievements, feedback, complaints and notes (newest first).
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const job = await getOwnedJob(user.id, parseInt((await ctx.params).id, 10));
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db
    .select()
    .from(schema.journalEntries)
    .where(and(eq(schema.journalEntries.jobId, job.id), eq(schema.journalEntries.userId, user.id)))
    .orderBy(desc(schema.journalEntries.entryDate), desc(schema.journalEntries.id));
  return NextResponse.json(rows.map(serializeTech));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const job = await getOwnedJob(user.id, parseInt((await ctx.params).id, 10));
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { values, error } = journalInput(await req.json(), { create: true });
  if (error) return NextResponse.json({ error }, { status: 400 });
  const [row] = await db
    .insert(schema.journalEntries)
    .values({
      entryDate: todayISO(),
      ...(values as { title: string }),
      userId: user.id,
      jobId: job.id,
    })
    .returning({ id: schema.journalEntries.id });
  return NextResponse.json({ id: row.id });
}
