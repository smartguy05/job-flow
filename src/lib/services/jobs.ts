import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { serializeTech, sortJobs, tenureMonths, todayISO } from "@/lib/jobs";

// Employment history: the jobs a user has held (current first), with tenure in months and
// technologies parsed to an array.
export async function listJobs(userId: string) {
  const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.userId, userId));
  const today = todayISO();
  return sortJobs(rows).map((j) => ({ ...serializeTech(j), tenureMonths: tenureMonths(j.startDate, j.endDate, today) }));
}
