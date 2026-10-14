import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { suggestInventions } from "@/lib/llm";
import { inventionHistory, normalizeTitle } from "@/lib/inventions";

export const maxDuration = 180;

// Suggest prior inventions the user may be missing, mined from their career profile,
// career files, jobs and work journal. Returns { suggestions } for review; nothing saved.
// Suggestions possibly made on an employer's time carry an ownershipCaution.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const [profile] = await db.select().from(schema.careerProfile).where(eq(schema.careerProfile.userId, user.id)).limit(1);
    const files = await db.select().from(schema.careerFiles).where(eq(schema.careerFiles.userId, user.id));
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.userId, user.id)).orderBy(asc(schema.jobs.startDate));
    const entries = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.userId, user.id));
    const history = inventionHistory({ profile: profile?.content ?? null, files, jobs, entries });
    if (!history.trim()) {
      return NextResponse.json({ error: "Add a career profile, files or jobs first — there's no history to search" }, { status: 400 });
    }
    const existing = (await db.select().from(schema.inventions).where(eq(schema.inventions.userId, user.id))).map((i) => i.title);
    const known = new Set(existing.map(normalizeTitle));
    const suggestions = (await suggestInventions({ userId: user.id, history, existing })).filter(
      (s) => !known.has(normalizeTitle(s.title)),
    );
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
