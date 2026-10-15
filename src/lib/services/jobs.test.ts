import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { seedUser } from "@/test/req";
import { listJobs } from "./jobs";

const uid = () => globalThis.__testUserId;

describe("listJobs", () => {
  it("lists only the user's jobs, current first, with tenure and parsed technologies", async () => {
    const other = await seedUser("jobs-other");
    await db.insert(schema.jobs).values([
      { userId: uid(), company: "Old Co", companyNormalized: "old", title: "Dev", startDate: "2018-01-01", endDate: "2020-01-01", technologies: '["Go"]' },
      { userId: uid(), company: "Now Co", companyNormalized: "now", title: "Lead", startDate: "2021-01-01" },
      { userId: other.id, company: "Secret", companyNormalized: "secret", title: "X" },
    ]);
    const jobs = await listJobs(uid());
    expect(jobs.map((j) => j.company)).toEqual(["Now Co", "Old Co"]);
    expect(jobs[1].technologies).toEqual(["Go"]);
    expect(jobs[1].tenureMonths).toBe(24);
  });
});
