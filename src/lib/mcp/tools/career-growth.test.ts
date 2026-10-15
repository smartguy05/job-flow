import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/llm-provider", () => ({ complete: vi.fn() }));

import { complete } from "@/lib/llm-provider";
import { db, schema } from "@/db";
import { seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "@/lib/services/errors";
import { listItems } from "@/lib/services/career-growth";
import { callTool } from "../registry";

const uid = () => globalThis.__testUserId;
async function makeJob(userId: string, company = "Tool Co") {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company, companyNormalized: company.toLowerCase(), title: "Engineer", startDate: "2022-01-01" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

describe("career-growth MCP tools", () => {
  it("log_one_on_one records a 1:1, optionally with a person", async () => {
    const jobId = await makeJob(uid());
    const [p] = await db.insert(schema.jobPeople).values({ userId: uid(), jobId, name: "Pat", relationship: "manager" }).returning();
    const { id } = (await callTool("log_one_on_one", uid(), {
      jobId,
      personId: p.id,
      date: "2026-10-01",
      notes: "Talked promo",
      actionItems: ["Write promo packet"],
    })) as { id: number };
    expect(id).toBeGreaterThan(0);
    const list = (await listItems("oneOnOnes", uid(), jobId)) as { personId: number; actionItems: unknown }[];
    expect(list[0]).toMatchObject({ personId: p.id, actionItems: [{ text: "Write promo packet", done: false }] });
  });

  it("add_review records a review", async () => {
    const jobId = await makeJob(uid());
    await callTool("add_review", uid(), { jobId, cycle: "2026 H1", rating: "Exceeds", strengths: "Ownership" });
    const [r] = (await listItems("reviews", uid(), jobId)) as { cycle: string; rating: string }[];
    expect(r).toMatchObject({ cycle: "2026 H1", rating: "Exceeds" });
  });

  it("update_goal creates without goalId and updates with one", async () => {
    const jobId = await makeJob(uid());
    const { id } = (await callTool("update_goal", uid(), { jobId, title: "Ship v2", period: "2026-H2" })) as { id: number };
    await callTool("update_goal", uid(), { jobId, goalId: id, progress: 60, keyResults: [{ text: "Beta", done: true }] });
    const [g] = (await listItems("goals", uid(), jobId)) as { progress: number; keyResults: unknown }[];
    expect(g).toMatchObject({ progress: 60, keyResults: [{ text: "Beta", done: true }] });
    await expect(callTool("update_goal", uid(), { jobId })).rejects.toBeInstanceOf(ValidationError);
  });

  it("get_brag_doc returns markdown and the structured doc", async () => {
    const jobId = await makeJob(uid());
    await db.insert(schema.journalEntries).values([
      { userId: uid(), jobId, kind: "achievement", title: "Cut cloud bill", impact: "-25%", entryDate: "2026-04-01" },
      { userId: uid(), jobId, kind: "complaint", title: "SECRET", entryDate: "2026-04-02" },
    ]);
    const r = (await callTool("get_brag_doc", uid(), { jobId, from: "2026-01-01" })) as { markdown: string };
    expect(r.markdown).toContain("Cut cloud bill");
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses another user's job", async () => {
    const other = await seedUser("growth-tools-other");
    const theirJob = await makeJob(other.id, "Their Co");
    const [g] = await db.insert(schema.goals).values({ userId: other.id, jobId: theirJob, title: "Theirs" }).returning();
    const myJob = await makeJob(uid());
    await expect(callTool("log_one_on_one", uid(), { jobId: theirJob, notes: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(callTool("add_review", uid(), { jobId: theirJob, cycle: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(callTool("update_goal", uid(), { jobId: theirJob, goalId: g.id, progress: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(callTool("update_goal", uid(), { jobId: myJob, goalId: g.id, progress: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(callTool("get_brag_doc", uid(), { jobId: theirJob })).rejects.toBeInstanceOf(NotFoundError);
  });
});
