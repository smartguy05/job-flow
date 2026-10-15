import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import { listJournal, addJournalEntry, updateJournalEntry, deleteJournalEntry } from "./journal";

const uid = () => globalThis.__testUserId;
async function makeJob(userId: string, company = "Initech") {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company, companyNormalized: company.toLowerCase(), title: "Engineer" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

describe("journal service", () => {
  it("adds entries (validating input) and lists across jobs with filters", async () => {
    const jobA = await makeJob(uid(), "A");
    const jobB = await makeJob(uid(), "B");
    await expect(addJournalEntry(uid(), jobA, {})).rejects.toBeInstanceOf(ValidationError);

    await addJournalEntry(uid(), jobA, { title: "Shipped X", entryDate: "2026-01-10", technologies: ["Go"] });
    await addJournalEntry(uid(), jobA, { title: "Praise", kind: "feedback", entryDate: "2026-03-01" });
    await addJournalEntry(uid(), jobB, { title: "Led Y", entryDate: "2026-02-15" });

    const all = await listJournal(uid());
    expect(all.map((e) => e.title)).toEqual(["Praise", "Led Y", "Shipped X"]);
    expect(all.find((e) => e.title === "Shipped X")?.technologies).toEqual(["Go"]);

    expect((await listJournal(uid(), { jobId: jobA })).map((e) => e.title)).toEqual(["Praise", "Shipped X"]);
    expect((await listJournal(uid(), { kind: "feedback" })).map((e) => e.title)).toEqual(["Praise"]);
    expect(
      (await listJournal(uid(), { from: "2026-02-01", to: "2026-02-28" })).map((e) => e.title),
    ).toEqual(["Led Y"]);
  });

  it("defaults entryDate to today", async () => {
    const job = await makeJob(uid());
    const { id } = await addJournalEntry(uid(), job, { title: "Today" });
    const [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id));
    expect(row.entryDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it("updates clear syncedAt; delete removes", async () => {
    const job = await makeJob(uid());
    const { id } = await addJournalEntry(uid(), job, { title: "Orig" });
    await db.update(schema.journalEntries).set({ syncedAt: new Date() }).where(eq(schema.journalEntries.id, id));
    await expect(updateJournalEntry(uid(), id, { kind: "bogus" })).rejects.toBeInstanceOf(ValidationError);
    await updateJournalEntry(uid(), id, { title: "Edited" });
    const [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id));
    expect(row.title).toBe("Edited");
    expect(row.syncedAt).toBeNull();
    await deleteJournalEntry(uid(), id);
    await expect(deleteJournalEntry(uid(), id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is isolated across tenants", async () => {
    const other = await seedUser("journal-svc-other");
    const job = await makeJob(uid());
    const { id } = await addJournalEntry(uid(), job, { title: "Secret" });

    expect(await listJournal(other.id)).toEqual([]);
    await expect(listJournal(other.id, { jobId: job })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addJournalEntry(other.id, job, { title: "Intrude" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateJournalEntry(other.id, id, { title: "Hacked" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteJournalEntry(other.id, id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
