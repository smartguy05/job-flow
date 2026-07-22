import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { logEvent } from "@/lib/events";
import { extractJobDescriptionText } from "@/lib/extract-text";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// 10MB cap keeps an uploaded posting comfortably within extraction limits.
const MAX_BYTES = 10 * 1024 * 1024;

// Update the job description a resume is tailored from. Accepts either multipart/form-data
// with a `file` (PDF/Word/text — text is extracted server-side) or JSON `{ jdSnapshot }`
// (pasted or amended text). Logs a `jd_updated` event so the change shows on the timeline.
// Regenerating a resume afterwards picks up the new text via createResumeForApplication.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    // Ownership check up front so we never extract or write for another user's application.
    const [app] = await db
      .select({ id: schema.applications.id })
      .from(schema.applications)
      .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)))
      .limit(1);
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let jdSnapshot: string;
    let detail = "Edited job description";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      if (file.size > MAX_BYTES)
        return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });

      const bytes = Buffer.from(await file.arrayBuffer());
      try {
        jdSnapshot = await extractJobDescriptionText(bytes, { name: file.name, mimeType: file.type });
      } catch (e) {
        // Unsupported type / extraction failure is a client problem, not a server error.
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
      }
      if (!jdSnapshot.trim())
        return NextResponse.json({ error: "No text could be extracted from that file." }, { status: 400 });
      detail = `Uploaded job description: ${file.name || "file"}`;
    } else {
      const body = await req.json();
      if (typeof body.jdSnapshot !== "string")
        return NextResponse.json({ error: "jdSnapshot is required" }, { status: 400 });
      jdSnapshot = body.jdSnapshot;
    }

    await db
      .update(schema.applications)
      .set({ jdSnapshot, updatedAt: new Date() })
      .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)));
    await logEvent(user.id, id, "jd_updated", detail);

    return NextResponse.json({ jdSnapshot });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
