import fs from "node:fs";
import path from "node:path";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "@/db";

// Assemble a user's career "source of truth" for resume generation: their career profile
// followed by any supplementary career files they've supplied.
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
