import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

// A user's supplementary career source files (text). Their content is folded into the
// resume-generation context alongside the career profile.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const rows = await db
    .select()
    .from(schema.careerFiles)
    .where(eq(schema.careerFiles.userId, user.id))
    .orderBy(asc(schema.careerFiles.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  const name: string = (body.name ?? "").trim();
  const content: string = body.content ?? "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  const [row] = await db
    .insert(schema.careerFiles)
    .values({ userId: user.id, name, content })
    .returning({ id: schema.careerFiles.id });
  return NextResponse.json({ id: row.id });
}
