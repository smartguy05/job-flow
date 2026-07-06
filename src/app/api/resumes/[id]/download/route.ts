import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const fmt = req.nextUrl.searchParams.get("fmt") === "docx" ? "docx" : "pdf";
  const [r] = await db
    .select({
      version: schema.resumes.version,
      baseName: schema.resumes.baseName,
      docxData: schema.resumes.docxData,
      pdfData: schema.resumes.pdfData,
    })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, user.id)))
    .limit(1);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = fmt === "docx" ? r.docxData : r.pdfData;
  if (!data) return NextResponse.json({ error: `No ${fmt} available` }, { status: 404 });

  const name = `${r.baseName ?? `resume_v${r.version}`}.${fmt}`;
  const type =
    fmt === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";
  const disposition = req.nextUrl.searchParams.get("inline") ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${disposition}; filename="${name}"`,
    },
  });
}
