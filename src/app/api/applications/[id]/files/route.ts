import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, desc } from "drizzle-orm";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

// Benefits paperwork is fed to the model as native PDF document blocks, so only PDFs are
// accepted. 10MB cap keeps a single packet comfortably within provider document limits.
const MAX_BYTES = 10 * 1024 * 1024;

async function ownedApp(applicationId: number, userId: string) {
  const [app] = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)))
    .limit(1);
  return app;
}

// List the metadata (no bytes) of files attached to an application.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const applicationId = parseInt((await ctx.params).id, 10);
  if (!(await ownedApp(applicationId, user.id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const files = await db
    .select({
      id: schema.applicationFiles.id,
      kind: schema.applicationFiles.kind,
      name: schema.applicationFiles.name,
      mimeType: schema.applicationFiles.mimeType,
      size: schema.applicationFiles.size,
      createdAt: schema.applicationFiles.createdAt,
    })
    .from(schema.applicationFiles)
    .where(
      and(
        eq(schema.applicationFiles.applicationId, applicationId),
        eq(schema.applicationFiles.userId, user.id),
      ),
    )
    .orderBy(desc(schema.applicationFiles.createdAt));
  return NextResponse.json(files);
}

// Upload a benefits document (multipart/form-data with a PDF `file`).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const applicationId = parseInt((await ctx.params).id, 10);
    if (!(await ownedApp(applicationId, user.id)))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.type !== "application/pdf")
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });

    const data = Buffer.from(await file.arrayBuffer());
    const [row] = await db
      .insert(schema.applicationFiles)
      .values({
        userId: user.id,
        applicationId,
        kind: "benefits",
        name: file.name || "document.pdf",
        mimeType: "application/pdf",
        size: data.length,
        data,
      })
      .returning({
        id: schema.applicationFiles.id,
        name: schema.applicationFiles.name,
        mimeType: schema.applicationFiles.mimeType,
        size: schema.applicationFiles.size,
        kind: schema.applicationFiles.kind,
        createdAt: schema.applicationFiles.createdAt,
      });
    await logEvent(user.id, applicationId, "file_uploaded", `Benefits: ${row.name}`);
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
