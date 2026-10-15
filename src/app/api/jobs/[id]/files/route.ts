import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/services/errors";
import { addJobFile, listJobFiles } from "@/lib/services/job-files";

type Ctx = { params: Promise<{ id: string }> };
const jobIdOf = async (ctx: Ctx) => parseInt((await ctx.params).id, 10);

// Metadata (no bytes) of the documents kept against a job.
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    return NextResponse.json(await listJobFiles(user.id, await jobIdOf(ctx)));
  } catch (e) {
    return errorResponse(e);
  }
}

// Upload a document: multipart/form-data with a PDF/DOCX `file` (≤10MB) and optional `kind`.
// Stored for download only; never sent to the AI.
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const jobId = await jobIdOf(ctx);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    const kind = form?.get("kind");
    return NextResponse.json(
      await addJobFile(user.id, jobId, {
        kind: typeof kind === "string" ? kind : null,
        name: file.name,
        mimeType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
