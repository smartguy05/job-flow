import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, ExternalHyperlink,
} from "docx";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ResumeContent } from "./resume-content";

const execFileP = promisify(execFile);

const COLORS = {
  primary: "1a365d",
  accent: "2b6cb0",
  text: "1a202c",
  muted: "4a5568",
};

function sectionHeader(text: string) {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 21, font: "Arial", color: COLORS.primary })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent, space: 3 } },
  });
}

function jobHeader(title: string, company: string, location: string, dates: string) {
  return new Paragraph({
    spacing: { before: 140, after: 50 },
    children: [
      new TextRun({ text: title, bold: true, size: 20, font: "Arial", color: COLORS.text }),
      new TextRun({ text: "  |  ", size: 20, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: company, size: 20, font: "Arial", color: COLORS.primary }),
      new TextRun({ text: "  |  ", size: 20, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: location, size: 20, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: "  (" + dates + ")", size: 19, font: "Arial", color: COLORS.muted, italics: true }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    spacing: { after: 45 },
    indent: { left: 240, hanging: 160 },
    children: [
      new TextRun({ text: "• ", size: 19, font: "Arial", color: COLORS.accent }),
      new TextRun({ text, size: 19, font: "Arial", color: COLORS.text }),
    ],
  });
}

function skillCategory(category: string, skills: string) {
  return new Paragraph({
    spacing: { after: 50 },
    children: [
      new TextRun({ text: category + ": ", bold: true, size: 19, font: "Arial", color: COLORS.primary }),
      new TextRun({ text: skills, size: 19, font: "Arial", color: COLORS.text }),
    ],
  });
}

function earlyCareerLine(title: string, company: string, dates: string, description: string) {
  return new Paragraph({
    spacing: { after: 50 },
    children: [
      new TextRun({ text: title, bold: true, size: 19, font: "Arial" }),
      new TextRun({ text: " — " + company + " (" + dates + "): ", size: 19, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: description, size: 19, font: "Arial" }),
    ],
  });
}

function projectLine(name: string, tech: string, description: string) {
  return new Paragraph({
    spacing: { after: 45 },
    children: [
      new TextRun({ text: name, bold: true, size: 19, font: "Arial", color: COLORS.primary }),
      new TextRun({ text: " (" + tech + ") — " + description, size: 19, font: "Arial", color: COLORS.text }),
    ],
  });
}

function link(label: string, url?: string) {
  if (!url) return new TextRun({ text: label, size: 18, font: "Arial", color: COLORS.text });
  return new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text: label, size: 18, font: "Arial", color: COLORS.accent })],
  });
}

export function buildDocx(content: ResumeContent): Document {
  const c = content.contact;
  const contactRun: (TextRun | ExternalHyperlink)[] = [
    new TextRun({ text: `${c.location}  •  ${c.phone}  •  ${c.email}  •  `, size: 18, font: "Arial", color: COLORS.text }),
  ];
  if (c.website) {
    contactRun.push(link(c.website, c.websiteUrl));
    contactRun.push(new TextRun({ text: "  •  ", size: 18, font: "Arial", color: COLORS.muted }));
  }
  contactRun.push(link("GitHub", c.githubUrl));
  contactRun.push(new TextRun({ text: "  •  ", size: 18, font: "Arial", color: COLORS.muted }));
  contactRun.push(link("LinkedIn", c.linkedinUrl));

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: c.name.toUpperCase(), bold: true, size: 40, font: "Arial", color: COLORS.primary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
      children: [new TextRun({ text: c.subtitle, size: 21, font: "Arial", color: COLORS.muted })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: contactRun }),

    sectionHeader("Professional Summary"),
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: content.summary, size: 19, font: "Arial", color: COLORS.text })],
    }),

    sectionHeader("Technical Expertise"),
    ...content.skills.map((s) => skillCategory(s.category, s.skills)),

    sectionHeader("Professional Experience"),
    ...content.jobs.flatMap((j) => [jobHeader(j.title, j.company, j.location, j.dates), ...j.bullets.map(bullet)]),
  ];

  if (content.earlyRoles.length) {
    children.push(sectionHeader("Earlier Experience"));
    for (const e of content.earlyRoles) children.push(earlyCareerLine(e.title, e.company, e.dates, e.description));
  }

  children.push(sectionHeader("Open Source & AI Projects"));
  for (const p of content.projects) children.push(projectLine(p.name, p.tech, p.description));
  if (content.githubLine.trim()) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: content.githubLine, size: 19, font: "Arial", color: COLORS.muted }),
        ],
      }),
    );
  }

  children.push(sectionHeader(content.whyCompany.heading));
  children.push(
    new Paragraph({ children: [new TextRun({ text: content.whyCompany.body, size: 19, font: "Arial", color: COLORS.text })] }),
  );

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 620, right: 620, bottom: 620, left: 620 },
          },
        },
        children,
      },
    ],
  });
}

export async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileP("pdfinfo", [pdfPath]);
    const m = stdout.match(/Pages:\s+(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0;
  }
}

// Fraction (0..1) of the last page occupied by content, from poppler `pdftotext -bbox`
// XHTML. pdfinfo only reports whole pages, so a resume that fills ~1.4 pages still reports
// 2 pages; this measures how far down the final page the text actually reaches so the fit
// loop can tell a full second page from a nearly-empty one. Returns 0 for an empty last page.
export function lastPageFillFromBbox(xml: string): number {
  const pages = xml.match(/<page\b[^>]*>[\s\S]*?<\/page>/g);
  if (!pages || pages.length === 0) return 0;
  const last = pages[pages.length - 1];
  const heightMatch = last.match(/height="([\d.]+)"/);
  const height = heightMatch ? parseFloat(heightMatch[1]) : 0;
  if (!height) return 0;
  let maxY = 0;
  for (const m of last.matchAll(/yMax="([\d.]+)"/g)) {
    const y = parseFloat(m[1]);
    if (y > maxY) maxY = y;
  }
  if (maxY <= 0) return 0;
  return Math.min(1, maxY / height);
}

// Runs `pdftotext -bbox` and returns the last page's fill fraction. On any failure returns
// 1 (assume full) so the fit loop never expands forever when the tool is unavailable.
export async function getPdfLastPageFill(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileP("pdftotext", ["-bbox", pdfPath, "-"]);
    return lastPageFillFromBbox(stdout);
  } catch {
    return 1;
  }
}

// Renders content -> docx + pdf bytes. soffice needs real files, so this uses a private
// temp workspace (cleaned up in finally) and returns the bytes for storage in the DB.
export async function renderResume(
  content: ResumeContent,
  baseName: string,
): Promise<{ docx: Buffer; pdf: Buffer; pageCount: number; lastPageFill: number }> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "resume-"));
  // Private LO profile dir so concurrent conversions don't collide on the default lock.
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-"));
  try {
    const docxPath = path.join(work, `${baseName}.docx`);
    const docx = await Packer.toBuffer(buildDocx(content));
    await fs.writeFile(docxPath, docx);

    await execFileP("soffice", [
      "--headless",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to", "pdf",
      "--outdir", work,
      docxPath,
    ], { timeout: 60000 });

    const pdfPath = path.join(work, `${baseName}.pdf`);
    const [pageCount, lastPageFill] = await Promise.all([
      getPdfPageCount(pdfPath),
      getPdfLastPageFill(pdfPath),
    ]);
    const pdf = await fs.readFile(pdfPath);
    return { docx: Buffer.isBuffer(docx) ? docx : Buffer.from(docx), pdf, pageCount, lastPageFill };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
    await fs.rm(profileDir, { recursive: true, force: true });
  }
}
