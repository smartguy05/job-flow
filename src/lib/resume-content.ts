import { z } from "zod";

// Structured resume content the LLM produces and the renderer consumes.
// Mirrors the sections in the resume skill template.

export const ContactSchema = z.object({
  name: z.string(),
  subtitle: z.string(),
  location: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string().optional(),
  websiteUrl: z.string().optional(),
  github: z.string().optional(),
  githubUrl: z.string().optional(),
  linkedin: z.string().optional(),
  linkedinUrl: z.string().optional(),
});

export const SkillCategorySchema = z.object({
  category: z.string(),
  skills: z.string(),
});

export const JobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  dates: z.string(),
  bullets: z.array(z.string()), // last bullet is the "Technologies:" line
});

export const EarlyRoleSchema = z.object({
  title: z.string(),
  company: z.string(),
  dates: z.string(),
  description: z.string(),
});

export const ProjectSchema = z.object({
  name: z.string(),
  tech: z.string(),
  description: z.string(),
});

export const ResumeContentSchema = z.object({
  contact: ContactSchema,
  summary: z.string(),
  skills: z.array(SkillCategorySchema),
  jobs: z.array(JobSchema),
  earlyRoles: z.array(EarlyRoleSchema),
  projects: z.array(ProjectSchema),
  githubLine: z.string().default(""),
  whyCompany: z.object({
    heading: z.string(), // e.g. "Why Acme & Senior Engineer"
    body: z.string(),
  }),
});

export type ResumeContent = z.infer<typeof ResumeContentSchema>;
export type ChatMessage = { role: "user" | "assistant"; content: string };
