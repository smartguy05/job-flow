import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ntfy", () => ({ sendNtfy: vi.fn() }));

import { GET, POST } from "./route";
import { sendNtfy } from "@/lib/ntfy";
import { req, insertApp } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockNtfy = vi.mocked(sendNtfy);
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  mockNtfy.mockReset();
  mockNtfy.mockResolvedValue(true);
  delete process.env.CRON_SECRET;
  // Each test asserts on global counts, so start from an empty applications table.
  await db.delete(schema.events);
  await db.delete(schema.applications);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/reminders", () => {
  it("lists open applications quiet beyond the window", async () => {
    await insertApp({ status: "applied", lastActivityAt: daysAgo(10) }); // quiet
    await insertApp({ status: "applied", lastActivityAt: daysAgo(1) }); // recent
    await insertApp({ status: "closed_won", lastActivityAt: daysAgo(30) }); // closed
    const body = await (await GET(req("/api/cron/reminders"))).json();
    expect(body).toHaveLength(1);
    expect(body[0].daysQuiet).toBeGreaterThanOrEqual(9);
  });

  it("flags an application whose next action is due even if it is not quiet", async () => {
    await insertApp({ status: "applied", lastActivityAt: daysAgo(1), nextAction: "reply", nextActionDate: daysAgo(1) });
    const body = await (await GET(req("/api/cron/reminders"))).json();
    expect(body).toHaveLength(1);
    expect(body[0].reason).toBe("next_action_due");
  });

  it("does not flag a future next action", async () => {
    await insertApp({ status: "applied", lastActivityAt: daysAgo(1), nextAction: "reply", nextActionDate: daysAgo(-3) });
    const body = await (await GET(req("/api/cron/reminders"))).json();
    expect(body).toHaveLength(0);
  });
});

describe("POST /api/cron/reminders", () => {
  it("rejects when the secret is set but not provided", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(req("/api/cron/reminders", "POST"));
    expect(res.status).toBe(401);
  });

  it("sends a push per quiet application and records lastRemindedAt", async () => {
    const id = await insertApp({ status: "applied", lastActivityAt: daysAgo(10) });
    const res = await POST(req("/api/cron/reminders", "POST"));
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.notificationsSent).toBe(1);
    expect(mockNtfy).toHaveBeenCalledOnce();
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.lastRemindedAt).not.toBeNull();
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, id));
    expect(events.some((e) => e.type === "reminder_sent")).toBe(true);
  });

  it("does not re-remind when already reminded within the quiet window", async () => {
    await insertApp({ status: "applied", lastActivityAt: daysAgo(10), lastRemindedAt: daysAgo(1) });
    const body = await (await POST(req("/api/cron/reminders", "POST"))).json();
    expect(body.candidates).toBe(0);
    expect(mockNtfy).not.toHaveBeenCalled();
  });

  it("re-nudges a still-quiet application last reminded beyond the quiet window", async () => {
    await insertApp({ status: "applied", lastActivityAt: daysAgo(20), lastRemindedAt: daysAgo(10) });
    const body = await (await POST(req("/api/cron/reminders", "POST"))).json();
    expect(body.candidates).toBe(1);
    expect(mockNtfy).toHaveBeenCalledOnce();
  });

  it("sending a reminder does not bump lastActivityAt (so the inactivity clock keeps running)", async () => {
    const activity = daysAgo(10);
    const id = await insertApp({ status: "applied", lastActivityAt: activity });
    await POST(req("/api/cron/reminders", "POST"));
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.lastRemindedAt).not.toBeNull();
    expect(app.lastActivityAt.toISOString()).toBe(activity.toISOString());
  });

  it("expires a stale open application before considering it for reminders", async () => {
    const id = await insertApp({ status: "applied", lastActivityAt: daysAgo(40) });
    const body = await (await POST(req("/api/cron/reminders", "POST"))).json();
    expect(body.expired).toBe(1);
    expect(body.candidates).toBe(0); // expired → no longer nudged
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.status).toBe("expired");
  });
});
