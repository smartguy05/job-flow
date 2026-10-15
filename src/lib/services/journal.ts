import { db, schema } from "@/db";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { journalInput, type Body } from "@/lib/job-input";
import { getOwnedJob, serializeTech, todayISO } from "@/lib/jobs";
import { NotFoundError, ValidationError } from "./errors";

export type JournalFilter = { jobId?: number; from?: string; to?: string; kind?: string };

const scope = (userId: string, id: number) =>
  and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId));

// Work-journal entries, newest first. Without `jobId` this spans all of the user's jobs;
// with one, the job must be owned (else NotFoundError). `from`/`to` are inclusive ISO dates
// on `entryDate`.
export async function listJournal(userId: string, filter: JournalFilter = {}) {
  const conds: SQL[] = [eq(schema.journalEntries.userId, userId)];
  if (filter.jobId !== undefined) {
    const job = await getOwnedJob(userId, filter.jobId);
    if (!job) throw new NotFoundError();
    conds.push(eq(schema.journalEntries.jobId, job.id));
  }
  if (filter.kind) conds.push(eq(schema.journalEntries.kind, filter.kind));
  if (filter.from) conds.push(gte(schema.journalEntries.entryDate, filter.from));
  if (filter.to) conds.push(lte(schema.journalEntries.entryDate, filter.to));
  const rows = await db
    .select()
    .from(schema.journalEntries)
    .where(and(...conds))
    .orderBy(desc(schema.journalEntries.entryDate), desc(schema.journalEntries.id));
  return rows.map(serializeTech);
}

export async function addJournalEntry(userId: string, jobId: number, body: Body): Promise<{ id: number }> {
  const job = await getOwnedJob(userId, jobId);
  if (!job) throw new NotFoundError();
  const { values, error } = journalInput(body, { create: true });
  if (error) throw new ValidationError(error);
  const [row] = await db
    .insert(schema.journalEntries)
    .values({ entryDate: todayISO(), ...(values as { title: string }), userId, jobId: job.id })
    .returning({ id: schema.journalEntries.id });
  return { id: row.id };
}

// Editing an entry clears syncedAt so the change is offered in the next profile sync.
export async function updateJournalEntry(userId: string, id: number, body: Body): Promise<void> {
  const { values, error } = journalInput(body);
  if (error) throw new ValidationError(error);
  const updated = await db
    .update(schema.journalEntries)
    .set({ ...values, syncedAt: null, updatedAt: new Date() })
    .where(scope(userId, id))
    .returning({ id: schema.journalEntries.id });
  if (updated.length === 0) throw new NotFoundError();
}

export async function deleteJournalEntry(userId: string, id: number): Promise<void> {
  const deleted = await db
    .delete(schema.journalEntries)
    .where(scope(userId, id))
    .returning({ id: schema.journalEntries.id });
  if (deleted.length === 0) throw new NotFoundError();
}
