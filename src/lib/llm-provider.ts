import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getSettings, activeModel } from "./settings";

export type LlmMessage = { role: "user" | "assistant"; content: string };

// A binary document attached to the request and sent to the model natively (no OCR/parse).
// `data` is base64-encoded; both providers read PDFs directly.
export type LlmDocument = { name: string; mediaType: "application/pdf"; data: string };

export type CompleteOpts = {
  userId: string; // whose provider/model preference to use
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  json?: boolean; // response is expected to be a JSON object
  documents?: LlmDocument[]; // attached to the last user message as native document blocks
};

// gpt-5 / o-series reasoning models use max_completion_tokens and reject a custom
// temperature; older chat models (gpt-4o, etc.) use max_tokens.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

// Index of the last user message, where any attached documents are placed.
function lastUserIndex(messages: LlmMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
  return -1;
}

async function completeAnthropic(opts: CompleteOpts, model: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (active provider: Anthropic)");
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const docs = opts.documents ?? [];
  const idx = lastUserIndex(opts.messages);
  if (docs.length && idx !== -1) {
    messages[idx] = {
      role: "user",
      content: [
        { type: "text", text: opts.messages[idx].content },
        ...docs.map((d) => ({
          type: "document" as const,
          source: { type: "base64" as const, media_type: d.mediaType, data: d.data },
        })),
      ],
    };
  }

  const msg = await client.messages.create({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages,
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

  const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = opts.messages.map(
    (m) => ({ role: m.role, content: m.content }),
  );
  const docs = opts.documents ?? [];
  const idx = lastUserIndex(opts.messages);
  if (docs.length && idx !== -1) {
    chatMessages[idx] = {
      role: "user",
      content: [
        { type: "text", text: opts.messages[idx].content },
        ...docs.map((d) => ({
          type: "file" as const,
          file: { filename: d.name, file_data: `data:${d.mediaType};base64,${d.data}` },
        })),
      ],
    };
  }

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [{ role: "system", content: opts.system }, ...chatMessages],
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

// Transcribe an audio file to text. OpenAI-only: `complete()` is text-chat only and
// Anthropic has no transcription endpoint, so this always uses OPENAI_API_KEY and the
// `transcriptionModel` setting regardless of the user's chat `provider`.
export async function transcribe(opts: { userId: string; file: File }): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("OPENAI_API_KEY is not set (required for audio transcription)");
  const settings = await getSettings(opts.userId);
  const client = new OpenAI({ apiKey });
  const res = await client.audio.transcriptions.create({
    model: settings.transcriptionModel,
    file: opts.file,
  });
  return res.text;
}
