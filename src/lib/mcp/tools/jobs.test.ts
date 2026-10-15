import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "@/lib/services/errors";
import { callTool } from "../registry";

const uid = () => globalThis.__testUserId;
async function makeJob(userId: string, company: string) {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company, companyNormalized: company.toLowerCase(), title: "Engineer", startDate: "2022-01-01" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

describe("employment-history tools", () => {
  it("list_jobs returns only the user's jobs", async () => {
    const other = await seedUser("jobs-tool-other");
    await makeJob(uid(), "Mine Co");
    await makeJob(other.id, "Their Co");
    const jobs = (await callTool("list_jobs", uid(), {})) as { company: string }[];
    expect(jobs.map((j) => j.company)).toEqual(["Mine Co"]);
  });

  it("add_journal_entry + list_journal round trip with filters", async () => {
    const jobId = await makeJob(uid(), "Journal Co");
    const { id } = (await callTool("add_journal_entry", uid(), {
      jobId,
      title: "Cut p99 latency 40%",
      kind: "achievement",
      impact: "Saved $20k/mo",
      entryDate: "2026-09-01",
      technologies: ["Go", "Postgres"],
    })) as { id: number };
    expect(id).toBeGreaterThan(0);
    await callTool("add_journal_entry", uid(), { jobId, title: "Kudos from VP", kind: "feedback", entryDate: "2026-10-01" });

    const all = (await callTool("list_journal", uid(), {})) as { title: string; technologies: string[] }[];
    expect(all.map((e) => e.title)).toEqual(["Kudos from VP", "Cut p99 latency 40%"]);
    expect(all[1].technologies).toEqual(["Go", "Postgres"]);
    const feedback = (await callTool("list_journal", uid(), { kind: "feedback" })) as { title: string }[];
    expect(feedback.map((e) => e.title)).toEqual(["Kudos from VP"]);
    const sept = (await callTool("list_journal", uid(), { jobId, from: "2026-09-01", to: "2026-09-30" })) as { title: string }[];
    expect(sept.map((e) => e.title)).toEqual(["Cut p99 latency 40%"]);
  });

  it("validates input", async () => {
    const jobId = await makeJob(uid(), "Valid Co");
    await expect(callTool("add_journal_entry", uid(), { jobId, title: "x", entryDate: "Sept 1" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses another user's job and never lists their entries", async () => {
    const other = await seedUser("journal-tool-other");
    const theirJob = await makeJob(other.id, "Their Job");
    await db.insert(schema.journalEntries).values({ userId: other.id, jobId: theirJob, title: "Secret win", entryDate: "2026-01-01" });
    await expect(callTool("add_journal_entry", uid(), { jobId: theirJob, title: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(callTool("list_journal", uid(), { jobId: theirJob })).rejects.toBeInstanceOf(NotFoundError);
    const mine = (await callTool("list_journal", uid(), {})) as { title: string }[];
    expect(mine.map((e) => e.title)).not.toContain("Secret win");
  });
});
