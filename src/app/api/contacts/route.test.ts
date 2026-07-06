import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { req } from "@/test/req";

describe("contacts", () => {
  it("requires a name", async () => {
    const res = await POST(req("/api/contacts", "POST", { agency: "TalentBridge" }));
    expect(res.status).toBe(400);
  });

  it("creates and lists contacts", async () => {
    await POST(req("/api/contacts", "POST", { name: "Sarah", agency: "TalentBridge", email: "s@x.com" }));
    const list = await (await GET(req("/api/contacts"))).json();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Sarah");
    expect(list[0].agency).toBe("TalentBridge");
  });
});
