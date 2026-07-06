import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const applicationId = parseInt((await ctx.params).id, 10);
  // The application must belong to this user.
  const [app] = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, user.id)))
    .limit(1);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const [row] = await db
    .insert(schema.interviews)
    .values({
      userId: user.id,
      applicationId,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      round: body.round ?? null,
      interviewer: body.interviewer ?? null,
      prepNotes: body.prepNotes ?? null,
      outcome: body.outcome ?? "pending",
    })
    .returning({ id: schema.interviews.id });
  await logEvent(user.id, applicationId, "interview", body.round || "Interview scheduled");
  return NextResponse.json({ id: row.id });
}
