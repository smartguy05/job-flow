import { describe, it, expect } from "vitest";
import { insertApp, seedUser } from "@/test/req";
import { callTool } from "../registry";

const uid = () => globalThis.__testUserId;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("needs_attention", () => {
  it("returns the user's quiet or due applications only", async () => {
    const other = await seedUser("attn-other");
    const quiet = await insertApp({ company: "Quiet Co", lastActivityAt: daysAgo(30) });
    const due = await insertApp({ company: "Due Co", nextAction: "Follow up", nextActionDate: daysAgo(1) });
    await insertApp({ company: "Fresh Co" });
    await insertApp({ userId: other.id, company: "Their Quiet Co", lastActivityAt: daysAgo(30) });

    const out = (await callTool("needs_attention", uid(), {})) as {
      quietDays: number;
      applications: { id: number; reason: string; userId?: string }[];
    };
    expect(out.quietDays).toBe(7);
    const byId = new Map(out.applications.map((a) => [a.id, a]));
    expect(byId.get(quiet)?.reason).toBe("quiet");
    expect(byId.get(due)?.reason).toBe("next_action_due");
    expect(out.applications).toHaveLength(2);
    expect(out.applications[0]).not.toHaveProperty("userId");
  });
});
