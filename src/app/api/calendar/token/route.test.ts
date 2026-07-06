import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { req, anonReq } from "@/test/req";

describe("/api/calendar/token", () => {
  it("401s without a session", async () => {
    expect((await GET(anonReq("/api/calendar/token"))).status).toBe(401);
    expect((await POST(anonReq("/api/calendar/token", "POST"))).status).toBe(401);
  });

  it("GET returns a null url before the feed is enabled", async () => {
    const res = await GET(req("/api/calendar/token"));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBeNull();
  });

  it("POST enables the feed and returns an absolute url with the token", async () => {
    const res = await POST(req("/api/calendar/token", "POST"));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(/^https?:\/\/.+\/api\/calendar\/feed\?token=.+/);

    // GET now reports the same url.
    const got = await (await GET(req("/api/calendar/token"))).json();
    expect(got.url).toBe(url);
  });

  it("POST regenerates a different token each time", async () => {
    const first = (await (await POST(req("/api/calendar/token", "POST"))).json()).url;
    const second = (await (await POST(req("/api/calendar/token", "POST"))).json()).url;
    expect(first).not.toBe(second);
  });
});
