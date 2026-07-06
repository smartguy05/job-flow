import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendNtfy } from "./ntfy";
import { setSettings } from "./settings";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("sendNtfy", () => {
  const userId = () => globalThis.__testUserId;

  it("returns false and does not fetch when disabled", async () => {
    await setSettings(userId(), { ntfyEnabled: false, ntfyUrl: "https://ntfy.sh/topic" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendNtfy(userId(), { title: "t", message: "m" })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns false when no URL is configured", async () => {
    await setSettings(userId(), { ntfyEnabled: true, ntfyUrl: "" });
    expect(await sendNtfy(userId(), { title: "t", message: "m" })).toBe(false);
  });

  it("POSTs the message with title/tags/click headers when enabled", async () => {
    await setSettings(userId(), { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const ok = await sendNtfy(userId(), { title: "Follow up", message: "quiet", tags: ["hourglass"], click: "http://x/1" });
    expect(ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://ntfy.sh/topic");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Title).toBe("Follow up");
    expect(headers.Tags).toBe("hourglass");
    expect(headers.Click).toBe("http://x/1");
    expect(init?.body).toBe("quiet");
  });

  it("returns false when fetch throws", async () => {
    await setSettings(userId(), { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    expect(await sendNtfy(userId(), { title: "t", message: "m" })).toBe(false);
  });
});
