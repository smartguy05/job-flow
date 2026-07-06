import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "./route";
import { req, insertApp } from "@/test/req";
import { db, schema } from "@/db";

beforeEach(async () => {
  await db.delete(schema.interviews);
  await db.delete(schema.events);
  await db.delete(schema.applications);
});

describe("GET /api/analytics", () => {
  it("reports zeros when there are no applications", async () => {
    const body = await (await GET(req("/api/analytics"))).json();
    expect(body.total).toBe(0);
    expect(body.responseRate).toBe(0);
    expect(body.interviewRate).toBe(0);
  });

  it("computes response and interview rates", async () => {
    await insertApp({ status: "applied" });
    await insertApp({ status: "in_progress" });
    const withInterview = await insertApp({ status: "in_progress" });
    await db.insert(schema.interviews).values({ userId: globalThis.__testUserId, applicationId: withInterview, round: "Screen" });

    const body = await (await GET(req("/api/analytics"))).json();
    expect(body.total).toBe(3);
    // 2 of 3 moved past "applied"
    expect(body.responseRate).toBeCloseTo(2 / 3, 5);
    // 1 of 3 has an interview
    expect(body.interviewRate).toBeCloseTo(1 / 3, 5);
    expect(body.byStatus.in_progress).toBe(2);
    expect(body.interviewsScheduled).toBe(1);
  });

  it("computes average base pay from the midpoint of ranges and counts by source", async () => {
    await insertApp({ payMin: 100000, payMax: 200000, sourceChannel: "recruiter" }); // midpoint 150k
    await insertApp({ payMin: 200000, payMax: 200000, sourceChannel: "recruiter" }); // midpoint 200k
    await insertApp({ sourceChannel: "linkedin" }); // no pay, ignored in avg
    const body = await (await GET(req("/api/analytics"))).json();
    expect(body.avgBasePay).toBe(175000);
    expect(body.countsBySource.recruiter).toBe(2);
    expect(body.countsBySource.linkedin).toBe(1);
  });

  it("reports null average pay when no application has pay data", async () => {
    await insertApp({});
    const body = await (await GET(req("/api/analytics"))).json();
    expect(body.avgBasePay).toBeNull();
  });
});
