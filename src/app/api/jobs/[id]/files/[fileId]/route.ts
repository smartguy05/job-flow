import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/services/errors";
import { deleteJobFile, getJobFile } from "@/lib/services/job-files";
import { contentDisposition } from "@/lib/job-files";

type Ctx = { params: Promise<{ id: string; fileId: string }> };
async function ids(ctx: Ctx) {
  const p = await ctx.params;
  return { jobId: parseInt(p.id, 10), fileId: parseInt(p.fileId, 10) };
}

// Download a job document (?inline=1 to view in the browser). Scoped by user + job.
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const { jobId, fileId } = await ids(ctx);
    const f = await getJobFile(user.id, jobId, fileId);
    return new NextResponse(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.mimeType,
        "Content-Disposition": contentDisposition(f.name, !!req.nextUrl.searchParams.get("inline")),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const { jobId, fileId } = await ids(ctx);
    await deleteJobFile(user.id, jobId, fileId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
