import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { logEvent } from "@/lib/events";
import { NotFoundError } from "./errors";

export type InterviewInput = {
  scheduledAt?: string | Date | null;
  round?: string | null;
  interviewer?: string | null;
  prepNotes?: string | null;
  outcome?: string | null;
};

const scope = (userId: string, id: number) =>
  and(eq(schema.interviews.id, id), eq(schema.interviews.userId, userId));

// Add an interview round to one of the user's applications and log an `interview` event.
export async function addInterview(
  userId: string,
  applicationId: number,
  input: InterviewInput,
): Promise<{ id: number }> {
  const [app] = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)))
    .limit(1);
  if (!app) throw new NotFoundError();

  const [row] = await db
    .insert(schema.interviews)
    .values({
      userId,
      applicationId,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      round: input.round ?? null,
      interviewer: input.interviewer ?? null,
      prepNotes: input.prepNotes ?? null,
      outcome: input.outcome ?? "pending",
    })
    .returning({ id: schema.interviews.id });
  await logEvent(userId, applicationId, "interview", input.round || "Interview scheduled");
  return { id: row.id };
}

// Partial update of an interview's scheduling fields; only provided keys change.
export async function updateInterview(userId: string, id: number, input: InterviewInput): Promise<void> {
  const update: Record<string, unknown> = {};
  if (input.scheduledAt !== undefined) update.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  for (const f of ["round", "interviewer", "prepNotes", "outcome"] as const) {
    if (input[f] !== undefined) update[f] = input[f];
  }
  const updated = await db
    .update(schema.interviews)
    .set(update)
    .where(scope(userId, id))
    .returning({ id: schema.interviews.id });
  if (updated.length === 0) throw new NotFoundError();
}

export async function deleteInterview(userId: string, id: number): Promise<void> {
  const deleted = await db.delete(schema.interviews).where(scope(userId, id)).returning({ id: schema.interviews.id });
  if (deleted.length === 0) throw new NotFoundError();
}
