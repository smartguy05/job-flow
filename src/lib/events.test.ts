import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { logEvent } from "./events";
import { eq } from "drizzle-orm";

async function makeApp() {
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(schema.applications)
    .values({
      userId: globalThis.__testUserId,
      company: "Globex",
      companyNormalized: "globex",
      roleTitle: "Engineer",
      status: "applied",
      lastActivityAt: past,
      createdAt: past,
      updatedAt: past,
    })
    .returning({ id: schema.applications.id });
  return row;
}

describe("logEvent", () => {
  it("inserts an event row for the application", async () => {
    const app = await makeApp();
    await logEvent(globalThis.__testUserId, app.id, "status_change", "applied → in_progress");
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, app.id));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("status_change");
    expect(events[0].detail).toBe("applied → in_progress");
  });

  it("bumps the application's lastActivityAt to now", async () => {
    const app = await makeApp();
    const [before] = await db.select().from(schema.applications).where(eq(schema.applications.id, app.id)).limit(1);
    await logEvent(globalThis.__testUserId, app.id, "note");
    const [after] = await db.select().from(schema.applications).where(eq(schema.applications.id, app.id)).limit(1);
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(before.lastActivityAt.getTime());
  });
});
