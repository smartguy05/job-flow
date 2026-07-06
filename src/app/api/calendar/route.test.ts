import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { req, anonReq, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import type { CalendarEvent } from "@/lib/calendar";

async function fetchEvents(request = req("/api/calendar")): Promise<CalendarEvent[]> {
  const res = await GET(request);
  return (await res.json()) as CalendarEvent[];
}

describe("GET /api/calendar", () => {
  it("401s without a session", async () => {
    const res = await GET(anonReq("/api/calendar"));
    expect(res.status).toBe(401);
  });

  it("returns scheduled interviews joined to their application", async () => {
    const appId = await insertApp({ company: "Acme", roleTitle: "Staff Eng" });
    const when = new Date("2026-07-10T15:00:00.000Z");
    await db
      .insert(schema.interviews)
      .values({ userId: globalThis.__testUserId, applicationId: appId, scheduledAt: when, round: "Technical", outcome: "pending" });

    const events = await fetchEvents();
    const iv = events.find((e) => e.type === "interview" && e.applicationId === appId);
    expect(iv).toBeDefined();
    expect(iv!.title).toBe("Technical");
    expect(iv!.company).toBe("Acme");
    expect(iv!.roleTitle).toBe("Staff Eng");
    expect(iv!.outcome).toBe("pending");
    expect(new Date(iv!.date).getTime()).toBe(when.getTime());
  });

  it("excludes interviews with no scheduledAt", async () => {
    const appId = await insertApp();
    await db
      .insert(schema.interviews)
      .values({ userId: globalThis.__testUserId, applicationId: appId, round: "Unscheduled screen" });

    const events = await fetchEvents();
    expect(events.some((e) => e.type === "interview" && e.applicationId === appId)).toBe(false);
  });

  it("returns application deadlines", async () => {
    const deadline = new Date("2026-08-01T00:00:00.000Z");
    const appId = await insertApp({ company: "Initech", applicationDeadline: deadline });

    const events = await fetchEvents();
    const dl = events.find((e) => e.type === "deadline" && e.applicationId === appId);
    expect(dl).toBeDefined();
    expect(dl!.company).toBe("Initech");
    expect(new Date(dl!.date).getTime()).toBe(deadline.getTime());
  });

  it("returns next-action dates labeled with nextAction", async () => {
    const due = new Date("2026-07-20T00:00:00.000Z");
    const appId = await insertApp({ nextAction: "Send thank-you note", nextActionDate: due });

    const events = await fetchEvents();
    const na = events.find((e) => e.type === "next_action" && e.applicationId === appId);
    expect(na).toBeDefined();
    expect(na!.title).toBe("Send thank-you note");
    expect(new Date(na!.date).getTime()).toBe(due.getTime());
  });

  it("does not leak another user's events", async () => {
    const other = await seedUser("calendar-other");
    const otherApp = await db
      .insert(schema.applications)
      .values({
        userId: other.id,
        company: "Secret Co",
        companyNormalized: "secret",
        roleTitle: "Spy",
        status: "applied",
        applicationDeadline: new Date("2026-07-15T00:00:00.000Z"),
      })
      .returning({ id: schema.applications.id });
    await db.insert(schema.interviews).values({
      userId: other.id,
      applicationId: otherApp[0].id,
      scheduledAt: new Date("2026-07-16T00:00:00.000Z"),
      round: "Secret round",
    });

    const events = await fetchEvents(); // default test user
    expect(events.some((e) => e.applicationId === otherApp[0].id)).toBe(false);
    expect(events.some((e) => e.company === "Secret Co")).toBe(false);
  });
});
