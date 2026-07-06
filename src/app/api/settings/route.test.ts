import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET, PUT } from "./route";
import { req } from "@/test/req";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe("GET /api/settings", () => {
  it("reports which provider keys are present and readiness for the active provider", async () => {
    process.env.OPENAI_API_KEY = "x";
    await PUT(req("/api/settings", "PUT", { provider: "openai" }));
    const body = await (await GET(req("/api/settings"))).json();
    expect(body.hasOpenaiKey).toBe(true);
    expect(body.hasAnthropicKey).toBe(false);
    expect(body.keyReadyForProvider).toBe(true);
  });

  it("flags keyReadyForProvider false when the active provider's key is missing", async () => {
    await PUT(req("/api/settings", "PUT", { provider: "anthropic" }));
    const body = await (await GET(req("/api/settings"))).json();
    expect(body.keyReadyForProvider).toBe(false);
  });

  it("reports transcriptionReady from the OpenAI key regardless of the chat provider", async () => {
    await PUT(req("/api/settings", "PUT", { provider: "anthropic" }));
    let body = await (await GET(req("/api/settings"))).json();
    expect(body.transcriptionReady).toBe(false);
    process.env.OPENAI_API_KEY = "x";
    body = await (await GET(req("/api/settings"))).json();
    expect(body.transcriptionReady).toBe(true);
  });
});

describe("PUT /api/settings", () => {
  it("persists partial settings", async () => {
    await PUT(req("/api/settings", "PUT", { dedupWindowDays: 21, openaiModel: "gpt-5.4" }));
    const body = await (await GET(req("/api/settings"))).json();
    expect(body.dedupWindowDays).toBe(21);
    expect(body.openaiModel).toBe("gpt-5.4");
  });
});
