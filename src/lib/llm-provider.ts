import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getSettings, activeModel } from "./settings";

export type LlmMessage = { role: "user" | "assistant"; content: string };

export type CompleteOpts = {
  userId: string; // whose provider/model preference to use
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  json?: boolean; // response is expected to be a JSON object
};

// gpt-5 / o-series reasoning models use max_completion_tokens and reject a custom
// temperature; older chat models (gpt-4o, etc.) use max_tokens.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

async function completeAnthropic(opts: CompleteOpts, model: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (active provider: Anthropic)");
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages,
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function completeOpenAI(opts: CompleteOpts, model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set (active provider: OpenAI)");
  const client = new OpenAI({ apiKey });

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
  };
  // gpt-5 / o-series use max_completion_tokens; older chat models use max_tokens.
  if (isReasoningModel(model)) {
    params.max_completion_tokens = opts.maxTokens;
  } else {
    params.max_tokens = opts.maxTokens;
  }
  if (opts.json) {
    params.response_format = { type: "json_object" };
  }

  const res = await client.chat.completions.create(params);
  return res.choices[0]?.message?.content ?? "";
}

// Unified completion used by every LLM operation. Dispatches on the global provider
// setting; returns raw text (callers parse JSON where needed).
export async function complete(opts: CompleteOpts): Promise<string> {
  const settings = await getSettings(opts.userId);
  const model = activeModel(settings);
  if (settings.provider === "openai") return completeOpenAI(opts, model);
  return completeAnthropic(opts, model);
}
