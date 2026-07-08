import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

async function ids(ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const p = await ctx.params;
  return { applicationId: parseInt(p.id, 10), fileId: parseInt(p.fileId, 10) };
}

// Download an uploaded application file. Scoped by userId + applicationId.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; fileId: string }> },
) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { applicationId, fileId } = await ids(ctx);
  const [f] = await db
    .select({
      name: schema.applicationFiles.name,
      mimeType: schema.applicationFiles.mimeType,
      data: schema.applicationFiles.data,
    })
    .from(schema.applicationFiles)
    .where(
      and(
        eq(schema.applicationFiles.id, fileId),
        eq(schema.applicationFiles.applicationId, applicationId),
        eq(schema.applicationFiles.userId, user.id),
      ),
    )
    .limit(1);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const disposition = req.nextUrl.searchParams.get("inline") ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Disposition": `${disposition}; filename="${f.name}"`,
    },
  });
}

// Delete an uploaded application file.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; fileId: string }> },
) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { applicationId, fileId } = await ids(ctx);
  const deleted = await db
    .delete(schema.applicationFiles)
    .where(
      and(
        eq(schema.applicationFiles.id, fileId),
        eq(schema.applicationFiles.applicationId, applicationId),
        eq(schema.applicationFiles.userId, user.id),
      ),
    )
    .returning({ id: schema.applicationFiles.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
