import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { computeAnalytics, type Analytics } from "@/lib/analytics";

// Load the rows outcome analytics needs (projected columns only — never resume/file blobs),
// all scoped to `userId`, and aggregate them with the pure `computeAnalytics`.
export async function getAnalytics(userId: string): Promise<Analytics> {
  const a = schema.applications;
  const [apps, interviews, resumes, events] = await Promise.all([
    db
      .select({
        id: a.id,
        status: a.status,
        createdAt: a.createdAt,
        appliedAt: a.appliedAt,
        payMin: a.payMin,
        payMax: a.payMax,
        sourceChannel: a.sourceChannel,
        seniorityLevel: a.seniorityLevel,
        locationMode: a.locationMode,
        interestRating: a.interestRating,
      })
      .from(a)
      .where(eq(a.userId, userId)),
    db
      .select({ applicationId: schema.interviews.applicationId })
      .from(schema.interviews)
      .where(eq(schema.interviews.userId, userId)),
    db
      .select({
        applicationId: schema.resumes.applicationId,
        sentAt: schema.resumes.sentAt,
        variantLabel: schema.resumes.variantLabel,
      })
      .from(schema.resumes)
      .where(eq(schema.resumes.userId, userId)),
    db
      .select({
        applicationId: schema.events.applicationId,
        type: schema.events.type,
        detail: schema.events.detail,
        createdAt: schema.events.createdAt,
      })
      .from(schema.events)
      .where(
        and(eq(schema.events.userId, userId), inArray(schema.events.type, ["status_change", "interview", "email"])),
      ),
  ]);
  return computeAnalytics({ apps, interviews, resumes, events });
}
