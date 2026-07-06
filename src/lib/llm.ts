import { ResumeContentSchema, type ResumeContent, type ChatMessage } from "./resume-content";
import { complete, type LlmMessage } from "./llm-provider";
import { getCareerInfo, getResumeSkill } from "./career";

function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

export type ExtractedJob = {
  company: string;
  roleTitle: string;
  link: string | null;
  jdSnapshot: string;
  contactName: string | null;
  contactAgency: string | null;
  contactEmail: string | null;
  // Rich detail fields — extracted when present in the source, null otherwise.
  payMin: number | null;
  payMax: number | null;
  payCurrency: string | null;
  payPeriod: string | null; // "year" | "hour"
  bonus: string | null;
  benefits: string | null;
  locationMode: string | null; // "remote" | "hybrid" | "onsite"
  location: string | null;
  employmentType: string | null;
  seniorityLevel: string | null;
  techStack: string | null; // comma-separated
  companySize: string | null;
  companyStage: string | null;
  industry: string | null;
  sourceChannel: string | null;
  datePosted: string | null; // ISO date
  applicationDeadline: string | null; // ISO date
  postingId: string | null;
  referralName: string | null;
};

// Pull structured fields out of a pasted recruiter message / JD / link content.
export async function extractJob(input: {
  userId: string;
  text: string;
  companyHint?: string;
  contactHint?: string;
}): Promise<ExtractedJob> {
  const text = await complete({
    userId: input.userId,
    maxTokens: 2000,
    json: true,
    system:
      "You extract structured job-application data from a recruiter message, job description, or job posting. " +
      "Return ONLY a JSON object. If a field is unknown, use null (or an empty string for jdSnapshot). " +
      "jdSnapshot should be a clean plain-text version of the role, responsibilities, and requirements — " +
      "strip boilerplate/marketing but keep the substance used for tailoring a resume. " +
      "For pay, return numeric payMin/payMax with no symbols/commas, payCurrency (e.g. USD), and payPeriod " +
      "('year' or 'hour'). locationMode must be 'remote', 'hybrid', or 'onsite'. techStack is a comma-separated " +
      "list of the role's key technologies. Dates (datePosted, applicationDeadline) must be ISO (YYYY-MM-DD) or null. " +
      "Do NOT invent values — use null when the source doesn't state something.",
    messages: [
      {
        role: "user",
        content:
          `Company hint (may be empty): ${input.companyHint || "(none)"}\n` +
          `Contact hint (may be empty): ${input.contactHint || "(none)"}\n\n` +
          `Source content:\n"""\n${input.text}\n"""\n\n` +
          `Return JSON with keys: company, roleTitle, link, jdSnapshot, contactName, contactAgency, contactEmail, ` +
          `payMin, payMax, payCurrency, payPeriod, bonus, benefits, locationMode, location, employmentType, ` +
          `seniorityLevel, techStack, companySize, companyStage, industry, sourceChannel, datePosted, ` +
          `applicationDeadline, postingId, referralName.`,
      },
    ],
  });
  return parseJson<ExtractedJob>(text);
}

// Generate the full structured resume tailored to the job.
export async function generateResumeContent(
  userId: string,
  job: {
    company: string;
    roleTitle: string;
    jdSnapshot: string;
    techStack?: string | null;
  },
): Promise<ResumeContent> {
  const [skill, careerInfo] = await Promise.all([getResumeSkill(userId), getCareerInfo(userId)]);
  const text = await complete({
    userId,
    maxTokens: 8000,
    json: true,
    system:
      "You are a resume builder that produces a structured JSON resume tailored to a specific job. " +
      "Follow the skill instructions EXACTLY, especially the accuracy rules: never fabricate. Every claim, " +
      "technology, metric, date, and accomplishment must be verifiable from the career info provided. " +
      "Tailor by emphasis, ordering, and keyword alignment only.\n\n" +
      "=== RESUME SKILL INSTRUCTIONS ===\n" + skill +
      "\n\n=== CAREER INFO (source of truth) ===\n" + careerInfo +
      "\n\nReturn ONLY a JSON object matching this shape (no prose): " +
      `{ contact: { name, subtitle, location, phone, email, website, websiteUrl, github, githubUrl, linkedin, linkedinUrl }, ` +
      `summary, skills: [{category, skills}], jobs: [{title, company, location, dates, bullets}], ` +
      `earlyRoles: [{title, company, dates, description}], projects: [{name, tech, description}], githubLine, ` +
      `whyCompany: {heading, body} }. ` +
      "The last bullet of each job MUST be a 'Technologies: ...' line. Aim for content that fills exactly two pages.",
    messages: [
      {
        role: "user",
        content:
          `Target company: ${job.company}\nTarget role: ${job.roleTitle}\n` +
          (job.techStack ? `Key technologies for this role (emphasize matching verified experience): ${job.techStack}\n` : "") +
          `\nJob description:\n"""\n${job.jdSnapshot}\n"""`,
      },
    ],
  });
  return ResumeContentSchema.parse(parseJson<unknown>(text));
}

// Apply free-text feedback to an existing resume, returning updated content.
export async function refineResumeContent(input: {
  userId: string;
  current: ResumeContent;
  chat: ChatMessage[];
  feedback: string;
  job: { company: string; roleTitle: string; jdSnapshot: string };
}): Promise<ResumeContent> {
  const careerInfo = await getCareerInfo(input.userId);
  const history: LlmMessage[] = input.chat.map((m) => ({ role: m.role, content: m.content }));
  const text = await complete({
    userId: input.userId,
    maxTokens: 8000,
    json: true,
    system:
      "You are refining a structured JSON resume based on user feedback. Preserve the exact JSON shape. " +
      "Never fabricate — every claim must remain verifiable from the career info. Apply the requested change " +
      "and return ONLY the complete updated JSON object.\n\n" +
      "=== CAREER INFO (source of truth) ===\n" + careerInfo +
      `\n\n=== TARGET ROLE ===\n${input.job.company} — ${input.job.roleTitle}\n${input.job.jdSnapshot}`,
    messages: [
      ...history,
      {
        role: "user",
        content:
          `Current resume JSON:\n${JSON.stringify(input.current)}\n\n` +
          `Feedback: ${input.feedback}\n\nReturn the full updated JSON object.`,
      },
    ],
  });
  return ResumeContentSchema.parse(parseJson<unknown>(text));
}

// Nudge the model to expand or condense to hit exactly 2 pages.
export async function adjustForLength(
  userId: string,
  current: ResumeContent,
  direction: "expand" | "condense",
  pageCount: number,
): Promise<ResumeContent> {
  const careerInfo = await getCareerInfo(userId);
  const instruction =
    direction === "expand"
      ? `The rendered resume is only ${pageCount} page(s); it must be exactly 2 full pages. Expand bullets with more ` +
        `specific verified detail (metrics, technologies, outcomes), add a 4th project if appropriate, and lengthen ` +
        `the summary and Why-Company section. Do not fabricate.`
      : `The rendered resume is ${pageCount} pages; it must be exactly 2 pages. Condense: reduce older jobs' bullets, ` +
        `shorten project and Why-Company text. Keep the most relevant, verified content.`;
  const text = await complete({
    userId,
    maxTokens: 8000,
    json: true,
    system:
      "You adjust a structured JSON resume's length. Preserve the exact JSON shape and never fabricate. " +
      "Return ONLY the complete updated JSON object.\n\n=== CAREER INFO ===\n" + careerInfo,
    messages: [{ role: "user", content: `${instruction}\n\nCurrent JSON:\n${JSON.stringify(current)}` }],
  });
  return ResumeContentSchema.parse(parseJson<unknown>(text));
}

// Generate a cover letter or recruiter reply.
export async function generateDraft(input: {
  userId: string;
  type: "reply" | "cover_letter" | "follow_up";
  job: { company: string; roleTitle: string; jdSnapshot: string };
  contactName?: string | null;
  extra?: string;
}): Promise<string> {
  const careerInfo = await getCareerInfo(input.userId);
  const kind =
    input.type === "reply"
      ? "a short, warm reply message to the recruiter expressing interest and attaching the tailored resume"
      : input.type === "cover_letter"
        ? "a concise one-page cover letter"
        : "a brief, polite follow-up message checking on application status";
  const text = await complete({
    userId: input.userId,
    maxTokens: 1500,
    system:
      "Write in the candidate's voice: direct, builder-focused, anti-hype, no clichés or corporate filler. " +
      "Use only facts verifiable from the career info.\n\n=== CAREER INFO ===\n" + careerInfo,
    messages: [
      {
        role: "user",
        content:
          `Write ${kind}.\nCompany: ${input.job.company}\nRole: ${input.job.roleTitle}\n` +
          `Recruiter: ${input.contactName || "the recruiter"}\n` +
          (input.extra ? `Additional context: ${input.extra}\n` : "") +
          `Job description:\n"""\n${input.job.jdSnapshot}\n"""\n\nReturn only the message text.`,
      },
    ],
  });
  return text.trim();
}

// Help the user edit their career profile: fold new details into the markdown.
export async function assistCareerProfile(input: {
  userId: string;
  current: string;
  instruction: string;
}): Promise<string> {
  const text = await complete({
    userId: input.userId,
    maxTokens: 8000,
    system:
      "You maintain a software engineer's master career-info markdown document. Integrate the user's new details " +
      "into the correct sections, matching the existing structure, formatting, and tone. Preserve all existing " +
      "content unless explicitly asked to change it. Return ONLY the complete updated markdown document.",
    messages: [
      {
        role: "user",
        content: `Current document:\n"""\n${input.current}\n"""\n\nInstruction / new details:\n${input.instruction}`,
      },
    ],
  });
  return text.trim();
}
