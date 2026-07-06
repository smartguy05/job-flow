import { db, schema } from "@/db";
import { and, eq, gte } from "drizzle-orm";

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|technologies|technology|labs|holdings)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const STOP = new Set([
  "senior", "sr", "junior", "jr", "staff", "lead", "principal", "software",
  "engineer", "developer", "development", "of", "the", "and", "a", "an", "ii",
  "iii", "iv", "i", "level",
]);

function roleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );
}

// Jaccard similarity on significant role tokens.
export function roleSimilarity(a: string, b: string): number {
  const ta = roleTokens(a);
  const tb = roleTokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

export type DuplicateMatch = {
  id: number;
  company: string;
  roleTitle: string;
  status: string;
  appliedAt: Date | null;
  createdAt: Date;
  similarity: number;
  daysAgo: number;
};

// Warn if same (normalized) company + similar role applied within the window.
// Scoped to the given user so one user's applications never match another's.
export async function findDuplicates(
  userId: string,
  company: string,
  roleTitle: string,
  windowDays: number,
  similarityThreshold = 0.4,
): Promise<DuplicateMatch[]> {
  const normalized = normalizeCompany(company);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.userId, userId),
        eq(schema.applications.companyNormalized, normalized),
        gte(schema.applications.createdAt, since),
      ),
    );

  return rows
    .map((r) => {
      const similarity = roleSimilarity(roleTitle, r.roleTitle);
      return {
        id: r.id,
        company: r.company,
        roleTitle: r.roleTitle,
        status: r.status,
        appliedAt: r.appliedAt,
        createdAt: r.createdAt,
        similarity,
        daysAgo: Math.floor((Date.now() - r.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      };
    })
    .filter((m) => m.similarity >= similarityThreshold)
    .sort((a, b) => b.similarity - a.similarity);
}
