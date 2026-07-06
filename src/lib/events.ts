import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

// Record an activity event and bump the owning application's last-activity timestamp.
// Scoped by userId so the activity bump can never touch another user's application.
export async function logEvent(userId: string, applicationId: number, type: string, detail?: string) {
  await db.insert(schema.events).values({ userId, applicationId, type, detail });
  await db
    .update(schema.applications)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)));
}
