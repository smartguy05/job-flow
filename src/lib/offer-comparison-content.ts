import { z } from "zod";

// The AI verdict half of an offer comparison. The deterministic side-by-side table lives in
// src/lib/offer-comparison.ts; this schema validates the LLM's judgement and recommendation.

export const OfferRankingSchema = z.object({
  applicationId: z.number(),
  rank: z.number(), // 1 = best fit
  rationale: z.string().default(""),
});

export const OfferFactorSchema = z.object({
  name: z.string(), // e.g. "Compensation", "Growth", "Work-life balance"
  notes: z.string().default(""),
});

export const OfferComparisonVerdictSchema = z.object({
  summary: z.string().default(""),
  recommendation: z.object({
    applicationId: z.number(),
    rationale: z.string().default(""),
  }),
  ranking: z.array(OfferRankingSchema).default([]),
  factors: z.array(OfferFactorSchema).default([]),
  risks: z.array(z.string()).default([]),
});

export type OfferComparisonVerdict = z.infer<typeof OfferComparisonVerdictSchema>;
