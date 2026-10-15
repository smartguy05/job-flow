import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/services/errors";
import { getBragDoc } from "@/lib/services/career-growth";
import { bragDocDocx } from "@/lib/brag-doc";

type Ctx = { params: Promise<{ id: string }> };

// Brag doc for a job, rendered on demand: ?from&to (YYYY-MM-DD, inclusive) and
// ?fmt=md (default) | json | docx. Built only from resume-safe data (see src/lib/brag-doc.ts).
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const fmt = sp.get("fmt") ?? "md";
  if (!["md", "json", "docx"].includes(fmt)) {
    return NextResponse.json({ error: "fmt must be md, json or docx" }, { status: 400 });
  }
  try {
    const { doc, markdown } = await getBragDoc(user.id, parseInt((await ctx.params).id, 10), {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    });
    if (fmt === "json") return NextResponse.json({ doc, markdown });
    if (fmt === "md") {
      return new NextResponse(markdown, {
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'inline; filename="brag-doc.md"' },
      });
    }
    return new NextResponse(new Uint8Array(await bragDocDocx(doc)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="brag-doc.docx"',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
