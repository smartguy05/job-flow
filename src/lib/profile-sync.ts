import { mergeTechnologies, parseTechList } from "@/lib/jobs";

// Build the instruction that asks the LLM (via assistCareerProfile) to fold employment
// history and journal wins into the career profile. Only resume-safe facts are included:
// complaints, private notes, compensation and benefits never leave JobFlow's private side.

export const SYNCABLE_KINDS = new Set(["achievement", "feedback"]);

type SyncJob = {
  id: number;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  team?: string | null;
  technologies: string;
  titles?: string[]; // title history (e.g. from promotions)
};

type SyncEntry = {
  id: number;
  jobId: number;
  kind: string;
  title: string;
  body: string;
  impact: string | null;
  technologies: string;
  entryDate: string | null;
};

export function buildSyncInstruction(jobs: SyncJob[], entries: SyncEntry[]) {
  const entryIds: number[] = [];
  const blocks = jobs.map((job) => {
    const mine = entries.filter((e) => e.jobId === job.id && SYNCABLE_KINDS.has(e.kind));
    entryIds.push(...mine.map((e) => e.id));
    const tech = mergeTechnologies(parseTechList(job.technologies), ...mine.map((e) => parseTechList(e.technologies)));
    const lines = [
      `## ${job.title} at ${job.company} (${job.startDate ?? "?"} – ${job.endDate ?? "present"})`,
    ];
    if (job.team) lines.push(`Team: ${job.team}`);
    if (job.titles && job.titles.length > 1) lines.push(`Title history: ${job.titles.join(" → ")}`);
    if (tech.length) lines.push(`Technologies: ${tech.join(", ")}`);
    for (const e of mine) {
      const label = e.kind === "feedback" ? "Feedback" : "Achievement";
      let line = `- ${label}${e.entryDate ? ` (${e.entryDate})` : ""}: ${e.title}`;
      if (e.body.trim()) line += ` — ${e.body.trim()}`;
      if (e.impact?.trim()) line += ` [Impact: ${e.impact.trim()}]`;
      lines.push(line);
    }
    return lines.join("\n");
  });
  const instruction =
    "Update the experience section with the following employment history and work-journal entries. " +
    "Add any job that is missing, merge new achievements, technologies and title changes into the existing " +
    "entry for that employer, and avoid duplicating details already present. Use only the facts below — " +
    "do not invent metrics, scope or technologies.\n\n" +
    blocks.join("\n\n");
  return { instruction, entryIds };
}
