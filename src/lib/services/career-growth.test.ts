import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm-provider", () => ({ complete: vi.fn() }));

import { complete } from "@/lib/llm-provider";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import {
  createItem,
  deleteItem,
  draftJobSelfReview,
  getBragDoc,
  listItems,
  updateItem,
} from "./career-growth";

const mockComplete = vi.mocked(complete);
beforeEach(() => {
  mockComplete.mockReset();
});

const uid = () => globalThis.__testUserId;
async function makeJob(userId: string, company = "Growth Co") {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company, companyNormalized: company.toLowerCase(), title: "Engineer", startDate: "2022-01-01", technologies: '["Go"]' })
    .returning({ id: schema.jobs.id });
  return j.id;
}

describe("career-growth CRUD", () => {
  it("creates, lists, updates and deletes people", async () => {
    const jobId = await makeJob(uid());
    const { id } = await createItem("people", uid(), jobId, { name: "Pat", relationship: "manager", startDate: "2023-01-01" });
    await createItem("people", uid(), jobId, { name: "Sam", relationship: "peer" });
    let list = (await listItems("people", uid(), jobId)) as { id: number; name: string; title: string | null }[];
    expect(list.map((p) => p.name)).toEqual(["Pat", "Sam"]);
    await updateItem("people", uid(), jobId, id, { title: "Director" });
    list = (await listItems("people", uid(), jobId)) as typeof list;
    expect(list.find((p) => p.id === id)?.title).toBe("Director");
    await deleteItem("people", uid(), jobId, id);
    list = (await listItems("people", uid(), jobId)) as typeof list;
    expect(list.map((p) => p.name)).toEqual(["Sam"]);
  });

  it("validates input", async () => {
    const jobId = await makeJob(uid());
    await expect(createItem("people", uid(), jobId, { relationship: "manager" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createItem("goals", uid(), jobId, { title: "x", progress: 500 })).rejects.toBeInstanceOf(ValidationError);
    await expect(createItem("reviews", uid(), jobId, {})).rejects.toBeInstanceOf(ValidationError);
    const { id } = await createItem("goals", uid(), jobId, { title: "x" });
    await expect(updateItem("goals", uid(), jobId, id, { status: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("logs 1:1s newest first with parsed action items, linked to a person of the same job", async () => {
    const jobId = await makeJob(uid());
    const otherJob = await makeJob(uid(), "Other Co");
    const { id: personId } = await createItem("people", uid(), jobId, { name: "Pat", relationship: "manager" });
    const { id: foreignPerson } = await createItem("people", uid(), otherJob, { name: "Elsewhere" });
    await createItem("oneOnOnes", uid(), jobId, { date: "2026-01-01", personId, notes: "first", actionItems: ["a"] });
    await createItem("oneOnOnes", uid(), jobId, { date: "2026-02-01", notes: "second", actionItems: [{ text: "b", done: true }] });
    const list = (await listItems("oneOnOnes", uid(), jobId)) as { notes: string; personId: number | null; actionItems: unknown }[];
    expect(list.map((o) => o.notes)).toEqual(["second", "first"]);
    expect(list[0].actionItems).toEqual([{ text: "b", done: true }]);
    expect(list[1].personId).toBe(personId);
    await expect(createItem("oneOnOnes", uid(), jobId, { personId: foreignPerson })).rejects.toBeInstanceOf(ValidationError);
  });

  it("links a review to a comp row of the same job only", async () => {
    const jobId = await makeJob(uid());
    const otherJob = await makeJob(uid(), "Other Co");
    const [comp] = await db.insert(schema.jobCompensation).values({ userId: uid(), jobId, kind: "raise", baseAmount: 1 }).returning();
    const [foreign] = await db
      .insert(schema.jobCompensation)
      .values({ userId: uid(), jobId: otherJob, kind: "raise", baseAmount: 1 })
      .returning();
    const { id } = await createItem("reviews", uid(), jobId, { cycle: "2026 H1", compensationId: comp.id });
    await expect(updateItem("reviews", uid(), jobId, id, { compensationId: foreign.id })).rejects.toBeInstanceOf(ValidationError);
    await updateItem("reviews", uid(), jobId, id, { compensationId: null });
    const [r] = (await listItems("reviews", uid(), jobId)) as { compensationId: number | null }[];
    expect(r.compensationId).toBeNull();
  });

  it("parses goal key results and sorts active goals first", async () => {
    const jobId = await makeJob(uid());
    await createItem("goals", uid(), jobId, { title: "Done one", status: "done" });
    await createItem("goals", uid(), jobId, { title: "Active one", keyResults: ["KR1"] });
    const list = (await listItems("goals", uid(), jobId)) as { title: string; keyResults: unknown; progress: number }[];
    expect(list.map((g) => g.title)).toEqual(["Active one", "Done one"]);
    expect(list[0].keyResults).toEqual([{ text: "KR1", done: false }]);
    expect(list[1].progress).toBe(100);
  });

  it("isolates tenants: another user's job and rows are not found", async () => {
    const other = await seedUser("growth-other");
    const theirJob = await makeJob(other.id, "Their Co");
    const { id: theirPerson } = await createItem("people", other.id, theirJob, { name: "Their boss", relationship: "manager" });
    const myJob = await makeJob(uid());

    await expect(listItems("people", uid(), theirJob)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createItem("goals", uid(), theirJob, { title: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateItem("people", uid(), theirJob, theirPerson, { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteItem("people", uid(), theirJob, theirPerson)).rejects.toBeInstanceOf(NotFoundError);
    // A row id from another job (even the caller's own) is not found under a different job.
    await expect(updateItem("people", uid(), myJob, theirPerson, { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createItem("oneOnOnes", uid(), myJob, { personId: theirPerson })).rejects.toBeInstanceOf(ValidationError);
    await expect(getBragDoc(uid(), theirJob)).rejects.toBeInstanceOf(NotFoundError);
    const [still] = await db.select().from(schema.jobPeople).where(eq(schema.jobPeople.id, theirPerson));
    expect(still.name).toBe("Their boss");
  });
});

describe("brag doc + self-review", () => {
  async function seedPrivate(jobId: number) {
    await db.insert(schema.journalEntries).values([
      { userId: uid(), jobId, kind: "achievement", title: "Launched billing", impact: "+$2M ARR", entryDate: "2026-03-01", technologies: '["Stripe"]' },
      { userId: uid(), jobId, kind: "complaint", title: "PRIVATE-COMPLAINT", body: "boss", entryDate: "2026-03-02" },
      { userId: uid(), jobId, kind: "note", title: "PRIVATE-NOTE", body: "note", entryDate: "2026-03-03" },
    ]);
    const { id: personId } = await createItem("people", uid(), jobId, { name: "Pat", relationship: "manager", notes: "PRIVATE-PERSON-NOTE" });
    await createItem("oneOnOnes", uid(), jobId, { personId, notes: "PRIVATE-1on1", actionItems: ["PRIVATE-ACTION"] });
    const [comp] = await db
      .insert(schema.jobCompensation)
      .values({ userId: uid(), jobId, kind: "raise", baseAmount: 987654, equity: "PRIVATE-EQUITY", notes: "PRIVATE-COMP" })
      .returning();
    await db.insert(schema.jobBenefits).values({ userId: uid(), jobId, ptoDays: 31, other: "PRIVATE-PTO" });
    await createItem("reviews", uid(), jobId, {
      cycle: "2026 H1",
      periodEnd: "2026-06-30",
      strengths: "Ownership",
      outcome: "PRIVATE-OUTCOME",
      compensationId: comp.id,
    });
    await createItem("goals", uid(), jobId, { title: "Ship billing", status: "done" });
    await db.update(schema.jobs).set({ notes: "PRIVATE-JOB-NOTE", reasonForLeaving: "PRIVATE-REASON" }).where(eq(schema.jobs.id, jobId));
  }
  const SECRETS = [
    "PRIVATE-COMPLAINT",
    "PRIVATE-NOTE",
    "PRIVATE-PERSON-NOTE",
    "PRIVATE-1on1",
    "PRIVATE-ACTION",
    "987654",
    "PRIVATE-EQUITY",
    "PRIVATE-COMP",
    "PRIVATE-PTO",
    "PRIVATE-OUTCOME",
    "PRIVATE-JOB-NOTE",
    "PRIVATE-REASON",
  ];

  it("getBragDoc returns the structured doc and markdown without private data", async () => {
    const jobId = await makeJob(uid());
    await seedPrivate(jobId);
    const r = await getBragDoc(uid(), jobId, { from: "2026-01-01", to: "2026-12-31" });
    expect(r.doc.achievements.map((a) => a.title)).toEqual(["Launched billing"]);
    expect(r.doc.goalsCompleted.map((g) => g.title)).toEqual(["Ship billing"]);
    expect(r.markdown).toContain("Launched billing");
    for (const s of SECRETS) expect(JSON.stringify(r)).not.toContain(s);
  });

  it("rejects malformed date filters", async () => {
    const jobId = await makeJob(uid());
    await expect(getBragDoc(uid(), jobId, { from: "March" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("drafts a self-review from the brag doc only — no private data reaches the LLM", async () => {
    const jobId = await makeJob(uid());
    await seedPrivate(jobId);
    mockComplete.mockResolvedValue("## Self-review\nI launched billing.");
    const r = await draftJobSelfReview(uid(), jobId, { cycle: "2026 H1" });
    expect(r.draft).toContain("launched billing");
    expect(mockComplete).toHaveBeenCalledOnce();
    const sent = JSON.stringify(mockComplete.mock.calls[0][0]);
    expect(sent).toContain("Launched billing");
    for (const s of SECRETS) expect(sent).not.toContain(s);
  });

  it("refuses to draft from an empty brag doc", async () => {
    const jobId = await makeJob(uid());
    await expect(draftJobSelfReview(uid(), jobId, {})).rejects.toBeInstanceOf(ValidationError);
    expect(mockComplete).not.toHaveBeenCalled();
  });
});
