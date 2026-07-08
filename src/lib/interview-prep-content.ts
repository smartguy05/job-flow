import { z } from "zod";

// Structured interview prep pack the LLM produces for a specific interview round.
// Persisted on the interview row and rendered/edited on the application detail page.

export const LikelyQuestionSchema = z.object({
  question: z.string(),
  category: z.string().default(""), // e.g. "behavioral", "technical", "system design"
  suggestedAnswer: z.string().default(""), // drawn STAR-style from the career profile
});

export const StudyTopicSchema = z.object({
  topic: z.string(),
  priority: z.string().default(""), // "high" | "medium" | "low"
  why: z.string().default(""),
});

export const InterviewPrepSchema = z.object({
  researchBrief: z.string().default(""),
  likelyQuestions: z.array(LikelyQuestionSchema).default([]),
  questionsToAsk: z.array(z.string()).default([]),
  studyChecklist: z.array(StudyTopicSchema).default([]),
});

export type LikelyQuestion = z.infer<typeof LikelyQuestionSchema>;
export type StudyTopic = z.infer<typeof StudyTopicSchema>;
export type InterviewPrepPack = z.infer<typeof InterviewPrepSchema>;
