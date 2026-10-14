import { z } from "zod";
import { INVENTION_KINDS } from "./inventions";

// Shapes the LLM returns for prior inventions: a single drafted entry, suggestions mined
// from the user's history, and entries parsed out of an existing Exhibit A.

const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
  z.string().nullable(),
);

export const DraftedInventionSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  inventionDate: optionalText.default(null),
  identifier: optionalText.default(null),
  kind: z.enum(INVENTION_KINDS).catch("other").default("software"),
  technologies: z.array(z.string()).default([]),
});

export const SuggestedInventionSchema = DraftedInventionSchema.extend({
  source: z.string().default(""), // where in the history this came from
  ownershipCaution: optionalText.default(null), // e.g. "created while employed at Acme"
});

export const SuggestionsSchema = z.object({ suggestions: z.array(SuggestedInventionSchema).default([]) });
export const ExtractedInventionsSchema = z.object({ inventions: z.array(DraftedInventionSchema).default([]) });

export type DraftedInvention = z.infer<typeof DraftedInventionSchema>;
export type SuggestedInvention = z.infer<typeof SuggestedInventionSchema>;
