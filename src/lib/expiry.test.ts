import { describe, it, expect, beforeEach } from "vitest";
import { expireStaleApplications } from "./expiry";
import { insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  await db.delete(schema.events);
  await db.delete(schema.applications);
});

async function appById(id: number) {
  const [a] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
  return a;
}

describe("expireStaleApplications", () => {
  it("expires an open application with no activity past the threshold", async () => {
    const activity = daysAgo(40);
    const id = await insertApp({ status: "applied", lastActivityAt: activity });

    const count = await expireStaleApplications(globalThis.__testUserId, 30);

    expect(count).toBe(1);
    const app = await appById(id);
    expect(app.status).toBe("expired");
    // lastActivityAt must NOT be bumped — the list keeps showing the true last-active date.
    expect(app.lastActivityAt.toISOString()).toBe(activity.toISOString());
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, id));
    expect(events.some((e) => e.type === "expired")).toBe(true);
  });

  it("leaves a recently-active open application untouched", async () => {
    const id = await insertApp({ status: "in_progress", lastActivityAt: daysAgo(3) });
    const count = await expireStaleApplications(globalThis.__testUserId, 30);
    expect(count).toBe(0);
    expect((await appById(id)).status).toBe("in_progress");
  });

  it("never expires a closed application", async () => {
    const won = await insertApp({ status: "closed_won", lastActivityAt: daysAgo(90) });
    const lost = await insertApp({ status: "closed_lost", lastActivityAt: daysAgo(90) });
    const count = await expireStaleApplications(globalThis.__testUserId, 30);
    expect(count).toBe(0);
    expect((await appById(won)).status).toBe("closed_won");
    expect((await appById(lost)).status).toBe("closed_lost");
  });

  it("honors the configured threshold", async () => {
    const id = await insertApp({ status: "applied", lastActivityAt: daysAgo(20) });
    // 20 days quiet, threshold 30 → not yet.
    expect(await expireStaleApplications(globalThis.__testUserId, 30)).toBe(0);
    // threshold 14 → now stale.
    expect(await expireStaleApplications(globalThis.__testUserId, 14)).toBe(1);
    expect((await appById(id)).status).toBe("expired");
  });

  it("disables expiry when the threshold is zero", async () => {
    const id = await insertApp({ status: "applied", lastActivityAt: daysAgo(365) });
    expect(await expireStaleApplications(globalThis.__testUserId, 0)).toBe(0);
    expect((await appById(id)).status).toBe("applied");
  });

  it("scopes expiry to the owning user", async () => {
    const id = await insertApp({ status: "applied", lastActivityAt: daysAgo(40) });
    const other = await seedUser("expiry-other-user");
    // Sweeping a different user must not touch this user's application.
    const count = await expireStaleApplications(other.id, 30);
    expect(count).toBe(0);
    expect((await appById(id)).status).toBe("applied");
  });
});
