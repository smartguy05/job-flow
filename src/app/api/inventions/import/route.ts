import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { extractInventions } from "@/lib/llm";
import { extractDocumentText, UnsupportedFileTypeError } from "@/lib/extract-text";
import { normalizeTitle } from "@/lib/inventions";

export const maxDuration = 180;

const MAX_BYTES = 10 * 1024 * 1024;

// Parse an existing Exhibit A into entries for review (nothing saved; the client saves the
// chosen ones via POST /api/inventions with an array). Accepts multipart/form-data with a
// `file` (PDF/Word/text) or JSON { text }. Entries whose title is already listed are
// flagged `duplicate`.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    let text = "";
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });
      text = await extractDocumentText(Buffer.from(await file.arrayBuffer()), { name: file.name, mimeType: file.type });
    } else {
      text = (await req.json()).text ?? "";
    }
    if (!text.trim()) return NextResponse.json({ error: "No text to import" }, { status: 400 });

    const existing = new Set(
      (await db.select().from(schema.inventions).where(eq(schema.inventions.userId, user.id))).map((i) =>
        normalizeTitle(i.title),
      ),
    );
    const inventions = (await extractInventions({ userId: user.id, text })).map((i) => ({
      ...i,
      duplicate: existing.has(normalizeTitle(i.title)),
    }));
    return NextResponse.json({ inventions });
  } catch (e) {
    const status = e instanceof UnsupportedFileTypeError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
