import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { generateDraft } from "@/lib/llm";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// Generate a cover letter / recruiter reply / follow-up draft and store it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const applicationId = parseInt((await ctx.params).id, 10);
    const body = await req.json();
    const type: "reply" | "cover_letter" | "follow_up" = body.type || "reply";

    const [app] = await db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, user.id)))
      .limit(1);
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const contact = app.contactId
      ? (await db.select().from(schema.contacts).where(eq(schema.contacts.id, app.contactId)).limit(1))[0]
      : null;

    const content = await generateDraft({
      userId: user.id,
      type,
      job: { company: app.company, roleTitle: app.roleTitle, jdSnapshot: app.jdSnapshot || "" },
      contactName: contact?.name,
      extra: body.extra,
    });

    const [row] = await db
      .insert(schema.messageDrafts)
      .values({ userId: user.id, applicationId, type, content })
      .returning({ id: schema.messageDrafts.id });
    await logEvent(user.id, applicationId, "note", `Generated ${type} draft`);
    return NextResponse.json({ id: row.id, content, type });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
