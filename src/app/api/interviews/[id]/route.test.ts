import { describe, it, expect } from "vitest";
import { PATCH, DELETE } from "./route";
import { POST as ADD } from "../../applications/[id]/interviews/route";
import { req, ctx, insertApp } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

describe("interviews", () => {
  it("adds an interview to an application and logs an event", async () => {
    const appId = await insertApp();
    const res = await ADD(req(`/api/applications/${appId}/interviews`, "POST", { round: "Technical", interviewer: "Pat" }), ctx(appId));
    const { id } = await res.json();
    const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
    expect(iv.round).toBe("Technical");
    expect(iv.outcome).toBe("pending");
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "interview")).toBe(true);
  });

  it("updates an interview outcome", async () => {
    const appId = await insertApp();
    const [iv] = await db
      .insert(schema.interviews)
      .values({ userId: globalThis.__testUserId, applicationId: appId, round: "Screen" })
      .returning({ id: schema.interviews.id });
    await PATCH(req(`/api/interviews/${iv.id}`, "PATCH", { outcome: "passed" }), ctx(iv.id));
    const [updated] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, iv.id)).limit(1);
    expect(updated.outcome).toBe("passed");
  });

  it("deletes an interview", async () => {
    const appId = await insertApp();
    const [iv] = await db
      .insert(schema.interviews)
      .values({ userId: globalThis.__testUserId, applicationId: appId })
      .returning({ id: schema.interviews.id });
    await DELETE(req(`/api/interviews/${iv.id}`, "DELETE"), ctx(iv.id));
    expect(await db.select().from(schema.interviews).where(eq(schema.interviews.id, iv.id))).toHaveLength(0);
  });
});
