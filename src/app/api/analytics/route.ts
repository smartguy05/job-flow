import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const apps = await db.select().from(schema.applications).where(eq(schema.applications.userId, user.id));
  const interviews = await db
    .select({ applicationId: schema.interviews.applicationId })
    .from(schema.interviews)
    .where(eq(schema.interviews.userId, user.id));
  const resumes = await db
    .select({ sentAt: schema.resumes.sentAt })
    .from(schema.resumes)
    .where(eq(schema.resumes.userId, user.id));

  const total = apps.length;
  const byStatus: Record<string, number> = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;

  const withInterview = new Set(interviews.map((i) => i.applicationId));
  // Expired apps died without progressing, so they don't count as a response.
  const responded = apps.filter((a) => a.status !== "applied" && a.status !== "expired").length;
  const sentResumes = resumes.filter((r) => r.sentAt).length;

  // Applications per month (by createdAt).
  const byMonth: Record<string, number> = {};
  for (const a of apps) {
    const key = a.createdAt.toISOString().slice(0, 7);
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }

  // Average base pay from the midpoint of each range that has pay data.
  const midpoints = apps
    .filter((a) => a.payMin != null || a.payMax != null)
    .map((a) => {
      const lo = a.payMin ?? a.payMax!;
      const hi = a.payMax ?? a.payMin!;
      return (lo + hi) / 2;
    });
  const avgBasePay = midpoints.length
    ? Math.round(midpoints.reduce((s, v) => s + v, 0) / midpoints.length)
    : null;

  // Application counts by source channel.
  const countsBySource: Record<string, number> = {};
  for (const a of apps) {
    if (a.sourceChannel) countsBySource[a.sourceChannel] = (countsBySource[a.sourceChannel] ?? 0) + 1;
  }

  return NextResponse.json({
    total,
    byStatus,
    responseRate: total ? responded / total : 0,
    interviewRate: total ? withInterview.size / total : 0,
    closedWon: byStatus["closed_won"] ?? 0,
    closedLost: byStatus["closed_lost"] ?? 0,
    interviewsScheduled: interviews.length,
    resumesGenerated: resumes.length,
    resumesSent: sentResumes,
    byMonth,
    avgBasePay,
    countsBySource,
  });
}
