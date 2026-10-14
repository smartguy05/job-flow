import fs from "node:fs";
import path from "node:path";
import { and, eq, asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { resumeInventionsSection } from "./inventions";

// Assemble a user's career "source of truth" for resume generation: their career profile,
// any supplementary career files, and the prior inventions they opted into resumes.
export async function getCareerInfo(userId: string): Promise<string> {
  const [profile] = await db
    .select()
    .from(schema.careerProfile)
    .where(eq(schema.careerProfile.userId, userId))
    .limit(1);
  const files = await db
    .select()
    .from(schema.careerFiles)
    .where(eq(schema.careerFiles.userId, userId))
    .orderBy(asc(schema.careerFiles.id));

  const parts: string[] = [];
  if (profile?.content?.trim()) parts.push(profile.content.trim());
  for (const f of files) {
    if (f.content?.trim()) parts.push(`# ${f.name}\n\n${f.content.trim()}`);
  }
  const inventions = await db
    .select()
    .from(schema.inventions)
    .where(and(eq(schema.inventions.userId, userId), eq(schema.inventions.includeInResume, true)))
    .orderBy(asc(schema.inventions.sortOrder), asc(schema.inventions.id));
  const section = resumeInventionsSection(inventions);
  if (section) parts.push(section);
  return parts.join("\n\n---\n\n");
}

// The shipped default resume "skill" instructions, used when a user hasn't customized theirs.
export function defaultResumeSkill(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "spec", "resume-skill", "SKILL.md"), "utf-8");
  } catch {
    return "";
  }
}

// A user's editable resume "skill" instructions, falling back to the shipped default.
export async function getResumeSkill(userId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.resumeSkill)
    .where(eq(schema.resumeSkill.userId, userId))
    .limit(1);
  return row?.content?.trim() ? row.content : defaultResumeSkill();
}
