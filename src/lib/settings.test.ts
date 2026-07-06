import { describe, it, expect } from "vitest";
import { getSettings, setSettings, activeModel, DEFAULT_SETTINGS } from "./settings";

describe("activeModel", () => {
  it("returns the anthropic model when provider is anthropic", () => {
    expect(activeModel({ ...DEFAULT_SETTINGS, provider: "anthropic", anthropicModel: "claude-x" })).toBe("claude-x");
  });
  it("returns the openai model when provider is openai", () => {
    expect(activeModel({ ...DEFAULT_SETTINGS, provider: "openai", openaiModel: "gpt-x" })).toBe("gpt-x");
  });
});

describe("getSettings / setSettings", () => {
  const userId = () => globalThis.__testUserId;

  it("returns defaults when nothing is stored", async () => {
    const s = await getSettings(userId());
    expect(s.provider).toBe("anthropic");
    expect(s.dedupWindowDays).toBe(30);
    expect(s.openaiModel).toBe("gpt-5.4");
    expect(s.transcriptionModel).toBe("whisper-1");
  });

  it("round-trips the transcription model", async () => {
    await setSettings(userId(), { transcriptionModel: "gpt-4o-mini-transcribe" });
    expect((await getSettings(userId())).transcriptionModel).toBe("gpt-4o-mini-transcribe");
  });

  it("persists and merges partial updates over defaults", async () => {
    await setSettings(userId(), { provider: "openai", dedupWindowDays: 14 });
    const s = await getSettings(userId());
    expect(s.provider).toBe("openai");
    expect(s.dedupWindowDays).toBe(14);
    // untouched keys keep their defaults
    expect(s.reminderQuietDays).toBe(DEFAULT_SETTINGS.reminderQuietDays);
  });

  it("round-trips non-string values (booleans/numbers)", async () => {
    await setSettings(userId(), { ntfyEnabled: true, reminderQuietDays: 3 });
    const s = await getSettings(userId());
    expect(s.ntfyEnabled).toBe(true);
    expect(s.reminderQuietDays).toBe(3);
  });

  it("upserts existing keys rather than duplicating", async () => {
    await setSettings(userId(), { dedupWindowDays: 5 });
    await setSettings(userId(), { dedupWindowDays: 9 });
    expect((await getSettings(userId())).dedupWindowDays).toBe(9);
  });
});
