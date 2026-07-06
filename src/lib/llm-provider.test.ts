import { describe, it, expect, vi, beforeEach } from "vitest";

const anthropicCreate = vi.fn();
const openaiCreate = vi.fn();
const openaiTranscribe = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
  },
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
    audio = { transcriptions: { create: openaiTranscribe } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
  },
}));

import { complete, transcribe } from "./llm-provider";
import { setSettings } from "./settings";

beforeEach(() => {
  anthropicCreate.mockReset();
  openaiCreate.mockReset();
  openaiTranscribe.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  process.env.OPENAI_API_KEY = "test-openai";
  anthropicCreate.mockResolvedValue({ content: [{ type: "text", text: "anthropic-reply" }] });
  openaiCreate.mockResolvedValue({ choices: [{ message: { content: "openai-reply" } }] });
  openaiTranscribe.mockResolvedValue({ text: "transcribed text" });
});

const base = {
  get userId() {
    return globalThis.__testUserId;
  },
  system: "sys",
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 100,
};

describe("complete — Anthropic provider", () => {
  beforeEach(async () => await setSettings(globalThis.__testUserId, { provider: "anthropic", anthropicModel: "claude-fable-5" }));

  it("calls the Messages API and joins text blocks", async () => {
    const out = await complete(base);
    expect(out).toBe("anthropic-reply");
    expect(anthropicCreate).toHaveBeenCalledOnce();
    const arg = anthropicCreate.mock.calls[0][0];
    expect(arg.model).toBe("claude-fable-5");
    expect(arg.max_tokens).toBe(100);
    expect(arg.system).toBe("sys");
    expect(arg.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws a provider-named error when the Anthropic key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(complete(base)).rejects.toThrow(/ANTHROPIC_API_KEY.*Anthropic/);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});

describe("complete — OpenAI provider", () => {
  it("prepends the system message and uses max_completion_tokens for gpt-5 models", async () => {
    await setSettings(globalThis.__testUserId, { provider: "openai", openaiModel: "gpt-5.4" });
    const out = await complete({ ...base, json: true });
    expect(out).toBe("openai-reply");
    const arg = openaiCreate.mock.calls[0][0];
    expect(arg.model).toBe("gpt-5.4");
    expect(arg.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(arg.messages[1]).toEqual({ role: "user", content: "hi" });
    expect(arg.max_completion_tokens).toBe(100);
    expect(arg.max_tokens).toBeUndefined();
    expect(arg.response_format).toEqual({ type: "json_object" });
  });

  it("uses max_tokens (not max_completion_tokens) for non-reasoning models", async () => {
    await setSettings(globalThis.__testUserId, { provider: "openai", openaiModel: "gpt-4o" });
    await complete(base);
    const arg = openaiCreate.mock.calls[0][0];
    expect(arg.max_tokens).toBe(100);
    expect(arg.max_completion_tokens).toBeUndefined();
    expect(arg.response_format).toBeUndefined();
  });

  it("omits response_format when json is not requested", async () => {
    await setSettings(globalThis.__testUserId, { provider: "openai", openaiModel: "gpt-5.4" });
    await complete(base);
    expect(openaiCreate.mock.calls[0][0].response_format).toBeUndefined();
  });

  it("throws a provider-named error when the OpenAI key is missing", async () => {
    await setSettings(globalThis.__testUserId, { provider: "openai" });
    delete process.env.OPENAI_API_KEY;
    await expect(complete(base)).rejects.toThrow(/OPENAI_API_KEY.*OpenAI/);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("treats o-series models as reasoning models", async () => {
    await setSettings(globalThis.__testUserId, { provider: "openai", openaiModel: "o3-mini" });
    await complete(base);
    expect(openaiCreate.mock.calls[0][0].max_completion_tokens).toBe(100);
  });
});

describe("transcribe", () => {
  const audioFile = () => new File([new Uint8Array([1, 2, 3])], "a.m4a", { type: "audio/m4a" });

  it("transcribes via OpenAI regardless of the chat provider", async () => {
    // Chat provider is Anthropic, but transcription must still use OpenAI/Whisper.
    await setSettings(globalThis.__testUserId, { provider: "anthropic", transcriptionModel: "whisper-1" });
    const out = await transcribe({ userId: globalThis.__testUserId, file: audioFile() });
    expect(out).toBe("transcribed text");
    expect(openaiTranscribe.mock.calls[0][0].model).toBe("whisper-1");
  });

  it("throws when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(transcribe({ userId: globalThis.__testUserId, file: audioFile() })).rejects.toThrow(
      /OPENAI_API_KEY/,
    );
    expect(openaiTranscribe).not.toHaveBeenCalled();
  });
});
