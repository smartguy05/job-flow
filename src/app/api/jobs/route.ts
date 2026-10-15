import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getUser, unauthorized } from "@/lib/auth";
import { jobInput } from "@/lib/job-input";
import { listJobs } from "@/lib/services/jobs";

// Employment history: the jobs a user has held (current first).
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(await listJobs(user.id));
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { values, error } = jobInput(await req.json(), { create: true });
  if (error) return NextResponse.json({ error }, { status: 400 });
  const [row] = await db
    .insert(schema.jobs)
    .values({ ...(values as typeof schema.jobs.$inferInsert), userId: user.id })
    .returning({ id: schema.jobs.id });
  return NextResponse.json({ id: row.id });
}
