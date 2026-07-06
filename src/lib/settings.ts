import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

export type LlmProvider = "anthropic" | "openai";

export type AppSettings = {
  dedupWindowDays: number;
  reminderQuietDays: number;
  ntfyUrl: string; // full topic URL, e.g. https://ntfy.sh/my-jobflow
  ntfyEnabled: boolean;
  provider: LlmProvider;
  anthropicModel: string;
  openaiModel: string;
  // OpenAI audio-transcription model for interview debriefs (requires OPENAI_API_KEY
  // regardless of the chat `provider`, since Anthropic has no transcription endpoint).
  transcriptionModel: string;
  subtitleDefault: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  dedupWindowDays: 30,
  reminderQuietDays: 7,
  ntfyUrl: "",
  ntfyEnabled: false,
  provider: "anthropic",
  anthropicModel: "claude-fable-5",
  openaiModel: "gpt-5.4",
  transcriptionModel: "whisper-1",
  subtitleDefault: "Senior Software Engineer  •  AI & Developer Tools Specialist",
};

// The model string for the currently selected provider.
export function activeModel(s: AppSettings): string {
  return s.provider === "openai" ? s.openaiModel : s.anthropicModel;
}

export async function getSettings(userId: string): Promise<AppSettings> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId));
  const merged = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      (merged as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      /* ignore malformed */
    }
  }
  return merged;
}

export async function setSettings(userId: string, partial: Partial<AppSettings>) {
  for (const [key, value] of Object.entries(partial)) {
    await db
      .insert(schema.settings)
      .values({ userId, key, value: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: [schema.settings.userId, schema.settings.key],
        set: { value: JSON.stringify(value) },
      });
  }
}
