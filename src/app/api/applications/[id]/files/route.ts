import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, desc } from "drizzle-orm";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

// Benefits paperwork is fed to the model as native PDF document blocks, so only PDFs are
// accepted. 10MB cap keeps a single packet comfortably within provider document limits.
const MAX_BYTES = 10 * 1024 * 1024;

const FILE_KINDS = ["benefits", "resume", "cover_letter", "message"] as const;
type FileKind = (typeof FILE_KINDS)[number];

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// benefits stays PDF-only (it's sent to the model as PDF document blocks during offer
// comparison); resume/cover_letter/message are pure storage, so PDF or DOCX is fine.
function allowedMimeTypes(kind: FileKind): string[] {
  return kind === "benefits" ? [PDF_MIME] : [PDF_MIME, DOCX_MIME];
}

const KIND_LABELS: Record<FileKind, string> = {
  benefits: "Benefits",
  resume: "Resume",
  cover_letter: "Cover letter",
  message: "Message",
};

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

    const kindField = form.get("kind");
    const kind: FileKind = kindField === null ? "benefits" : (kindField as string) as FileKind;
    if (!FILE_KINDS.includes(kind))
      return NextResponse.json({ error: "Unsupported file kind" }, { status: 400 });

    const allowed = allowedMimeTypes(kind);
    if (!allowed.includes(file.type))
      return NextResponse.json(
        {
          error:
            kind === "benefits"
              ? "Only PDF files are supported"
              : "Only PDF or DOCX files are supported",
        },
        { status: 400 },
      );
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });

    const data = Buffer.from(await file.arrayBuffer());
    const [row] = await db
      .insert(schema.applicationFiles)
      .values({
        userId: user.id,
        applicationId,
        kind,
        name: file.name || (file.type === DOCX_MIME ? "document.docx" : "document.pdf"),
        mimeType: file.type,
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
    await logEvent(user.id, applicationId, "file_uploaded", `${KIND_LABELS[kind]}: ${row.name}`);
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
