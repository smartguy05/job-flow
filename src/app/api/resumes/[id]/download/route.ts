import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { getResumeFile } from "@/lib/services/resumes";
import { errorResponse } from "@/lib/services/errors";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const fmt = req.nextUrl.searchParams.get("fmt") === "docx" ? "docx" : "pdf";
  try {
    const file = await getResumeFile(user.id, id, fmt);
    const disposition = req.nextUrl.searchParams.get("inline") ? "inline" : "attachment";
    return new NextResponse(file.data, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${disposition}; filename="${file.filename}"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
