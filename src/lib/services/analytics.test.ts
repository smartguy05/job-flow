import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import { getAnalytics } from "./analytics";

const uid = () => globalThis.__testUserId;

describe("analytics service", () => {
  it("aggregates only the user's own applications, resumes, interviews and events", async () => {
    const other = await seedUser("analytics-other");
    const mine = await insertApp({ sourceChannel: "linkedin", appliedAt: new Date("2026-01-01T00:00:00Z") });
    const theirs = await insertApp({ userId: other.id, sourceChannel: "linkedin", status: "in_progress" });
    await db.insert(schema.resumes).values([
      { userId: uid(), applicationId: mine, version: 1, contentJson: "{}", sentAt: new Date(), variantLabel: "A" },
      { userId: other.id, applicationId: theirs, version: 1, contentJson: "{}", sentAt: new Date(), variantLabel: "B" },
    ]);
    await db.insert(schema.interviews).values({ userId: other.id, applicationId: theirs, round: "Screen" });
    await db.insert(schema.events).values([
      { userId: uid(), applicationId: mine, type: "email", detail: "Email (recruiter reply): hi", createdAt: new Date("2026-01-03T00:00:00Z") },
      { userId: other.id, applicationId: theirs, type: "interview", detail: "Screen", createdAt: new Date("2026-01-02T00:00:00Z") },
    ]);

    const a = await getAnalytics(uid());
    expect(a.total).toBe(1);
    expect(a.interviewsScheduled).toBe(0);
    expect(a.resumesSent).toBe(1);
    expect(a.byResumeVariant.map((b) => b.key)).toEqual(["A"]);
    expect(a.funnel.overall).toMatchObject({ applied: 1, responded: 1, interviewed: 0 });
    expect(a.timeToFirstResponse).toMatchObject({ n: 1, medianDays: 2 });

    const b = await getAnalytics(other.id);
    expect(b.total).toBe(1);
    expect(b.byResumeVariant.map((x) => x.key)).toEqual(["B"]);
    expect(b.funnel.overall.interviewed).toBe(1);
  });
});
