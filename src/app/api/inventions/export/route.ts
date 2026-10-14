import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { exhibitText } from "@/lib/inventions";
import { buildExhibitDocx } from "@/lib/exhibit-docx";
import { docxToPdf } from "@/lib/docx-pdf";

// Render the Exhibit A on demand (nothing stored): ?fmt=text|docx|pdf, optional ?ids=1,2,3
// to export a subset. Private notes and the resume flag never appear in the output.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const fmt = req.nextUrl.searchParams.get("fmt") ?? "pdf";
  if (!["text", "docx", "pdf"].includes(fmt)) {
    return NextResponse.json({ error: "fmt must be text, docx or pdf" }, { status: 400 });
  }
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter(Number.isInteger);
  const entries = await db
    .select()
    .from(schema.inventions)
    .where(
      and(eq(schema.inventions.userId, user.id), ids.length ? inArray(schema.inventions.id, ids) : undefined),
    )
    .orderBy(asc(schema.inventions.sortOrder), asc(schema.inventions.id));
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  const ownerName = owner?.name ?? owner?.email ?? null;

  if (fmt === "text") {
    return new NextResponse(exhibitText(entries, ownerName), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const docx = await buildExhibitDocx(entries, ownerName);
  const data = fmt === "docx" ? docx : await docxToPdf(docx, "Exhibit_A");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type":
        fmt === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": `attachment; filename="Exhibit_A.${fmt}"`,
    },
  });
}
