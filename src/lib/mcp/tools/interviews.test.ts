import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError } from "@/lib/services/errors";
import { callTool } from "../registry";

const uid = () => globalThis.__testUserId;

describe("add_interview / update_interview", () => {
  it("adds a round then updates it", async () => {
    const appId = await insertApp();
    const { id } = (await callTool("add_interview", uid(), {
      applicationId: appId,
      round: "Tech screen",
      scheduledAt: "2026-11-02T15:00:00Z",
      interviewer: "Ada",
    })) as { id: number };
    let [row] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(row).toMatchObject({ userId: uid(), round: "Tech screen", interviewer: "Ada", outcome: "pending" });
    expect(row.scheduledAt?.toISOString()).toBe("2026-11-02T15:00:00.000Z");

    await callTool("update_interview", uid(), { id, outcome: "passed", prepNotes: "System design" });
    [row] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(row).toMatchObject({ outcome: "passed", prepNotes: "System design", round: "Tech screen" });
  });

  it("refuses another user's application and interview", async () => {
    const other = await seedUser("iv-other");
    const theirApp = await insertApp({ userId: other.id });
    await expect(callTool("add_interview", uid(), { applicationId: theirApp, round: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const [theirs] = await db
      .insert(schema.interviews)
      .values({ userId: other.id, applicationId: theirApp, round: "Onsite" })
      .returning();
    await expect(callTool("update_interview", uid(), { id: theirs.id, outcome: "failed" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const [row] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, theirs.id));
    expect(row.outcome).not.toBe("failed");
  });
});
