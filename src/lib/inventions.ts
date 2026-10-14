import { parseBody, type Body, type Parsed } from "@/lib/job-input";
import { parseTechList } from "@/lib/jobs";

// Prior inventions ("Exhibit A"): request parsing, the plain-text exhibit, and the opt-in
// section folded into resume-generation context. Server-side (imports the jobs helpers);
// the client gets labels from job-labels.ts and the text exhibit from the export route.

export const INVENTION_KINDS = ["software", "invention", "authorship", "other"] as const;

export function inventionInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  const r = parseBody(
    body,
    {
      required: ["title"],
      text: ["inventionDate", "identifier", "notes"],
      enums: { kind: INVENTION_KINDS },
      bools: ["includeInResume"],
      ints: ["sortOrder"],
      tech: true,
    },
    !!opts.create,
  );
  // Description is NOT NULL: keep blanks as "" rather than null.
  if (!r.error && body.description !== undefined) {
    r.values.description = typeof body.description === "string" ? body.description.trim() : "";
  }
  return r;
}

type ExhibitEntry = {
  title: string;
  description: string;
  inventionDate: string | null;
  identifier: string | null;
};

export const EXHIBIT_TITLE = "EXHIBIT A";
export const EXHIBIT_SUBTITLE = "LIST OF PRIOR INVENTIONS AND ORIGINAL WORKS OF AUTHORSHIP";

const LINE = "______________________________";

// The exhibit as plain text, for pasting into an employer's form or e-sign document.
export function exhibitText(entries: ExhibitEntry[], ownerName: string | null): string {
  const out = [EXHIBIT_TITLE, EXHIBIT_SUBTITLE, ""];
  if (entries.length === 0) {
    out.push("No prior inventions or original works of authorship to disclose.");
  }
  entries.forEach((e, i) => {
    out.push(`${i + 1}. ${e.title}${e.inventionDate ? ` (${e.inventionDate})` : ""}`);
    if (e.identifier) out.push(`   Identifying number: ${e.identifier}`);
    if (e.description.trim()) out.push(`   ${e.description.trim()}`);
    out.push("");
  });
  out.push("", `Signature: ${LINE}`, `Name: ${ownerName ?? LINE}`, `Date: ${LINE}`);
  return out.join("\n");
}

// Markdown appended to the career info for resume generation: opted-in entries only.
export function resumeInventionsSection(
  entries: (ExhibitEntry & { includeInResume: boolean; technologies: string })[],
): string {
  const included = entries.filter((e) => e.includeInResume);
  if (included.length === 0) return "";
  const blocks = included.map((e) => {
    const lines = [`## ${e.title}${e.inventionDate ? ` (${e.inventionDate})` : ""}`];
    if (e.description.trim()) lines.push(e.description.trim());
    const tech = parseTechList(e.technologies);
    if (tech.length) lines.push(`Technologies: ${tech.join(", ")}`);
    if (e.identifier) lines.push(`Link: ${e.identifier}`);
    return lines.join("\n");
  });
  return `# Personal projects & inventions\n\n${blocks.join("\n\n")}`;
}

// Title identity used to flag import duplicates.
export function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Career history handed to the "suggest from my history" prompt. Complaints are left out
// (not useful for finding prior work); everything stays between the user and their model.
export function inventionHistory(input: {
  profile: string | null;
  files: { name: string; content: string }[];
  jobs: { id: number; company: string; title: string; startDate: string | null; endDate: string | null }[];
  entries: { jobId: number; kind: string; title: string; body: string; entryDate: string | null }[];
}): string {
  const parts: string[] = [];
  if (input.profile?.trim()) parts.push(`# Career profile\n\n${input.profile.trim()}`);
  for (const f of input.files) if (f.content.trim()) parts.push(`# ${f.name}\n\n${f.content.trim()}`);
  if (input.jobs.length) {
    const blocks = input.jobs.map((j) => {
      const lines = [`## ${j.title} at ${j.company} (${j.startDate ?? "?"} – ${j.endDate ?? "present"})`];
      for (const e of input.entries.filter((x) => x.jobId === j.id && x.kind !== "complaint")) {
        lines.push(`- ${e.entryDate ?? ""} ${e.title}${e.body.trim() ? ` — ${e.body.trim()}` : ""}`.trim());
      }
      return lines.join("\n");
    });
    parts.push(`# Employment history & work journal\n\n${blocks.join("\n\n")}`);
  }
  return parts.join("\n\n---\n\n");
}
