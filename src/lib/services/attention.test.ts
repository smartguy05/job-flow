import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import { candidatesForUser } from "./attention";

const uid = () => globalThis.__testUserId;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  await db.delete(schema.events);
  await db.delete(schema.applications);
});

describe("candidatesForUser", () => {
  it("returns quiet and due-action open apps, quiet taking precedence", async () => {
    const quiet = await insertApp({ lastActivityAt: daysAgo(10) });
    const due = await insertApp({ lastActivityAt: daysAgo(1), nextActionDate: daysAgo(1), nextAction: "Email" });
    const both = await insertApp({ lastActivityAt: daysAgo(10), nextActionDate: daysAgo(1) });
    await insertApp({ lastActivityAt: daysAgo(1) }); // recent, nothing due
    await insertApp({ status: "closed_lost", lastActivityAt: daysAgo(30) });
    await insertApp({ lastActivityAt: daysAgo(10), lastRemindedAt: daysAgo(1) }); // reminded recently

    const c = await candidatesForUser(uid(), 7);
    const byId = new Map(c.map((x) => [x.id, x]));
    expect(byId.size).toBe(3);
    expect(byId.get(quiet)).toMatchObject({ reason: "quiet", daysQuiet: 10 });
    expect(byId.get(due)).toMatchObject({ reason: "next_action_due", nextAction: "Email" });
    expect(byId.get(both)?.reason).toBe("quiet");
  });

  it("never returns another user's applications", async () => {
    const other = await seedUser("attention-svc-other");
    await insertApp({ lastActivityAt: daysAgo(10) });
    expect(await candidatesForUser(other.id, 7)).toEqual([]);
  });
});
