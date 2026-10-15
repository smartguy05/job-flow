import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError } from "./errors";
import { addInterview, updateInterview, deleteInterview } from "./interviews";

const uid = () => globalThis.__testUserId;
const getInterview = async (id: number) =>
  (await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)))[0];

describe("interviews service", () => {
  it("adds an interview with defaults and logs an interview event", async () => {
    const appId = await insertApp();
    const { id } = await addInterview(uid(), appId, { round: "Technical", scheduledAt: "2026-11-01T15:00:00Z" });
    const row = await getInterview(id);
    expect(row.round).toBe("Technical");
    expect(row.outcome).toBe("pending");
    expect(row.scheduledAt?.toISOString()).toBe("2026-11-01T15:00:00.000Z");
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "interview" && e.detail === "Technical")).toBe(true);
  });

  it("refuses to add to another user's application", async () => {
    const other = await seedUser("iv-svc-add-other");
    const appId = await insertApp();
    await expect(addInterview(other.id, appId, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates and deletes only when owned", async () => {
    const other = await seedUser("iv-svc-upd-other");
    const appId = await insertApp();
    const { id } = await addInterview(uid(), appId, {});
    await expect(updateInterview(other.id, id, { outcome: "passed" })).rejects.toBeInstanceOf(NotFoundError);
    await updateInterview(uid(), id, { outcome: "passed", scheduledAt: null, interviewer: "Pat" });
    const row = await getInterview(id);
    expect(row.outcome).toBe("passed");
    expect(row.interviewer).toBe("Pat");
    expect(row.scheduledAt).toBeNull();

    await expect(deleteInterview(other.id, id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteInterview(uid(), id);
    expect(await getInterview(id)).toBeUndefined();
  });
});
