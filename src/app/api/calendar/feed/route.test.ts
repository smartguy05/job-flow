import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { anonReq, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { getOrCreateCalendarToken } from "@/lib/calendar-data";

describe("GET /api/calendar/feed", () => {
  it("404s with a missing token", async () => {
    const res = await GET(anonReq("/api/calendar/feed"));
    expect(res.status).toBe(404);
  });

  it("404s with an unknown token", async () => {
    const res = await GET(anonReq("/api/calendar/feed?token=not-a-real-token"));
    expect(res.status).toBe(404);
  });

  it("serves a text/calendar body for a valid token (no session cookie)", async () => {
    const token = await getOrCreateCalendarToken(globalThis.__testUserId);
    const appId = await insertApp({ company: "Acme", roleTitle: "Staff Eng" });
    await db.insert(schema.interviews).values({
      userId: globalThis.__testUserId,
      applicationId: appId,
      scheduledAt: new Date("2026-07-10T15:00:00.000Z"),
      round: "Technical",
      outcome: "pending",
    });

    const res = await GET(anonReq(`/api/calendar/feed?token=${token}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("DTSTART:20260710T150000Z");
    expect(body).toContain("Acme");
  });

  it("only returns the token owner's events", async () => {
    const token = await getOrCreateCalendarToken(globalThis.__testUserId);
    const other = await seedUser("feed-other");
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

    const res = await GET(anonReq(`/api/calendar/feed?token=${token}`));
    const body = await res.text();
    expect(body).not.toContain("Secret Co");
    expect(body).not.toContain(`/applications/${otherApp[0].id}`);
  });
});
