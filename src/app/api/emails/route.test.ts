import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { anonReq, insertApp, req, seedUser } from "@/test/req";
import { GET } from "./route";

describe("GET /api/emails", () => {
  it("requires a session", async () => {
    expect((await GET(anonReq("/api/emails"))).status).toBe(401);
  });

  it("lists only the user's recent email activity", async () => {
    const other = await seedUser("emails-route-other");
    const id = await insertApp({ company: "Route Co" });
    await db.insert(schema.ingestedEmails).values([
      { userId: globalThis.__testUserId, messageId: "r-1", applicationId: id, kind: "rejection", summary: "No", appliedAt: new Date() },
      { userId: globalThis.__testUserId, messageId: "r-2", kind: "other", summary: "Newsletter" },
      { userId: other.id, messageId: "r-3", kind: "offer", summary: "Theirs" },
    ]);
    const res = await GET(req("/api/emails"));
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { messageId: string; company: string | null }[];
    expect(rows.map((r) => r.messageId).sort()).toEqual(["r-1", "r-2"]);
    expect(rows.find((r) => r.messageId === "r-1")?.company).toBe("Route Co");
    const limited = (await (await GET(req("/api/emails?limit=1"))).json()) as unknown[];
    expect(limited).toHaveLength(1);
  });
});
