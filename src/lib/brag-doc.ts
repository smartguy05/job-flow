import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { mergeTechnologies, parseTechList } from "@/lib/jobs";
import { parseChecklist } from "@/lib/career-growth";

// Brag doc: a dated record of what you achieved at a job, built from the work journal,
// reviews and goals. Pure (no DB, no LLM). Its output is also the ONLY input to the
// self-review draft, so it must stay free of private data: complaints, notes, 1:1s, people
// notes, compensation, equity, PTO and review outcomes are never read here.

type JobLike = { company: string; title: string; technologies: string | string[] };
type EntryLike = {
  kind: string;
  title: string;
  body: string;
  impact: string | null;
  technologies: string | string[];
  entryDate: string | null;
};
type GoalLike = {
  title: string;
  description: string | null;
  period: string | null;
  status: string;
  progress: number;
  keyResults: string | { text: string; done: boolean }[];
};
type ReviewLike = {
  cycle: string;
  periodStart: string | null;
  periodEnd: string | null;
  rating: string | null;
  reviewer: string | null;
  summary: string | null;
  strengths: string | null;
  growthAreas: string | null;
};

export type BragDocInput = {
  job: JobLike;
  entries: EntryLike[];
  goals: GoalLike[];
  reviews: ReviewLike[];
  from?: string;
  to?: string;
};

export type BragDoc = {
  job: { company: string; title: string };
  from: string | null;
  to: string | null;
  achievements: { date: string | null; title: string; detail: string; impact: string | null; technologies: string[] }[];
  feedback: { date: string | null; title: string; detail: string }[];
  goalsCompleted: { title: string; period: string | null; description: string | null; keyResults: string[] }[];
  goalsInProgress: { title: string; period: string | null; progress: number }[];
  technologies: string[];
};

const techList = (v: string | string[]) => (Array.isArray(v) ? v : parseTechList(v));

// Dated items are kept when inside [from, to]; undated ones only when no range is set.
function inRange(date: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  return (!from || date >= from) && (!to || date <= to);
}

const byDateDesc = <T extends { date: string | null }>(a: T, b: T) => (b.date ?? "").localeCompare(a.date ?? "");

export function buildBragDoc(input: BragDocInput): BragDoc {
  const { from, to } = input;
  const entries = input.entries.filter((e) => inRange(e.entryDate, from, to));
  const wins = entries.filter((e) => e.kind === "achievement");

  const achievements = wins
    .map((e) => ({
      date: e.entryDate,
      title: e.title,
      detail: e.body.trim(),
      impact: e.impact?.trim() || null,
      technologies: techList(e.technologies),
    }))
    .sort(byDateDesc);

  const journalFeedback = entries
    .filter((e) => e.kind === "feedback")
    .map((e) => ({ date: e.entryDate, title: e.title, detail: e.body.trim() }));
  const reviewFeedback = input.reviews
    .filter((r) => inRange(r.periodEnd ?? r.periodStart, from, to))
    .map((r) => {
      const parts = [
        r.rating && `Rating: ${r.rating}`,
        r.summary,
        r.strengths && `Strengths: ${r.strengths}`,
        r.growthAreas && `Growth areas: ${r.growthAreas}`,
      ].filter(Boolean);
      return {
        date: r.periodEnd ?? r.periodStart,
        title: `${r.cycle} review${r.reviewer ? ` (${r.reviewer})` : ""}`,
        detail: parts.join(". "),
      };
    });
  const feedback = [...journalFeedback, ...reviewFeedback].sort(byDateDesc);

  const checklist = (v: GoalLike["keyResults"]) => (Array.isArray(v) ? v : parseChecklist(v));
  const goalsCompleted = input.goals
    .filter((g) => g.status === "done")
    .map((g) => ({
      title: g.title,
      period: g.period,
      description: g.description,
      keyResults: checklist(g.keyResults).map((k) => k.text),
    }));
  const goalsInProgress = input.goals
    .filter((g) => g.status === "active")
    .map((g) => ({ title: g.title, period: g.period, progress: g.progress }));

  return {
    job: { company: input.job.company, title: input.job.title },
    from: from ?? null,
    to: to ?? null,
    achievements,
    feedback,
    goalsCompleted,
    goalsInProgress,
    technologies: mergeTechnologies(techList(input.job.technologies), ...wins.map((e) => techList(e.technologies))),
  };
}

const NONE = "_Nothing recorded._";
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function achievementLine(a: BragDoc["achievements"][number]): string {
  let line = `**${a.title}**${a.date ? ` (${a.date})` : ""}`;
  if (a.detail) line += ` — ${sentence(a.detail)}`;
  if (a.impact) line += `${a.detail ? "" : " —"} Impact: ${a.impact}`;
  if (a.technologies.length) line += ` [${a.technologies.join(", ")}]`;
  return line;
}

// Sections as [heading, lines[]] so Markdown and DOCX render the same content.
function sections(doc: BragDoc): [string, string[]][] {
  return [
    ["Achievements", doc.achievements.map(achievementLine)],
    [
      "Feedback received",
      doc.feedback.map((f) => `**${f.title}**${f.date ? ` (${f.date})` : ""}${f.detail ? ` — ${f.detail}` : ""}`),
    ],
    [
      "Goals completed",
      doc.goalsCompleted.map(
        (g) =>
          `**${g.title}**${g.period ? ` (${g.period})` : ""}${g.description ? ` — ${g.description}` : ""}` +
          (g.keyResults.length ? `. Key results: ${g.keyResults.join("; ")}` : ""),
      ),
    ],
    ["Goals in progress", doc.goalsInProgress.map((g) => `${g.title}${g.period ? ` (${g.period})` : ""} — ${g.progress}%`)],
    ["Technologies", doc.technologies.length ? [doc.technologies.join(", ")] : []],
  ];
}

const rangeLabel = (doc: BragDoc) => `${doc.from ?? "start"} – ${doc.to ?? "today"}`;
const docTitle = (doc: BragDoc) => `Brag doc — ${doc.job.title} at ${doc.job.company}`;

export function bragDocMarkdown(doc: BragDoc): string {
  const out = [`# ${docTitle(doc)}`, "", `_${rangeLabel(doc)}_`];
  for (const [heading, lines] of sections(doc)) {
    out.push("", `## ${heading}`, "");
    if (!lines.length) out.push(NONE);
    else if (heading === "Technologies") out.push(lines[0]);
    else out.push(...lines.map((l) => `- ${l}`));
  }
  return out.join("\n") + "\n";
}

// Inline **bold** spans become bold runs; everything else is plain text.
function runs(line: string): TextRun[] {
  return line
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? new TextRun({ text: part.slice(2, -2), bold: true })
        : new TextRun({ text: part }),
    );
}

export async function bragDocDocx(doc: BragDoc): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(docTitle(doc))] }),
    new Paragraph({ children: [new TextRun({ text: rangeLabel(doc), italics: true })] }),
  ];
  for (const [heading, lines] of sections(doc)) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(heading)] }));
    if (!lines.length) children.push(new Paragraph({ children: [new TextRun({ text: "Nothing recorded.", italics: true })] }));
    for (const line of lines) {
      children.push(
        heading === "Technologies"
          ? new Paragraph({ children: runs(line) })
          : new Paragraph({ bullet: { level: 0 }, children: runs(line) }),
      );
    }
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
