import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { transcribe } from "@/lib/llm-provider";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// Set the interview's transcript. Accepts either multipart/form-data with an audio `file`
// (transcribed server-side via Whisper; audio is discarded) or JSON `{ transcript }` (pasted).
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    // Ownership check up front so we never transcribe for another user's interview.
    const [iv] = await db
      .select({ id: schema.interviews.id })
      .from(schema.interviews)
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)))
      .limit(1);
    if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let transcript: string;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
      transcript = await transcribe({ userId: user.id, file });
    } else {
      const body = await req.json();
      if (typeof body.transcript !== "string")
        return NextResponse.json({ error: "transcript is required" }, { status: 400 });
      transcript = body.transcript;
    }

    await db
      .update(schema.interviews)
      .set({ transcript })
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)));
    return NextResponse.json({ transcript });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
