import { describe, it, expect } from "vitest";
import { insertApp, seedUser } from "@/test/req";
import { callTool, getTool } from "../registry";
import type { Analytics } from "@/lib/analytics";

describe("get_analytics", () => {
  it("is read-only and returns only the caller's outcome analytics", async () => {
    expect(getTool("get_analytics").annotations?.readOnlyHint).toBe(true);
    const other = await seedUser("mcp-analytics-other");
    await insertApp({ sourceChannel: "referral", status: "in_progress" });
    await insertApp({ userId: other.id, sourceChannel: "linkedin" });
    await insertApp({ userId: other.id, sourceChannel: "linkedin" });

    const out = (await callTool("get_analytics", globalThis.__testUserId, {})) as Analytics;
    expect(out.total).toBe(1);
    expect(out.funnel.bySource.map((s) => s.source)).toEqual(["referral"]);
    expect(out.responseRate).toBe(1);
    expect(out.timeToFirstResponse).toBeDefined();
    expect(out.byResumeVariant[0]).toMatchObject({ key: "no resume sent", smallSample: true });

    const theirs = (await callTool("get_analytics", other.id)) as Analytics;
    expect(theirs.total).toBe(2);
    expect(theirs.responseRate).toBe(0);
  });
});
