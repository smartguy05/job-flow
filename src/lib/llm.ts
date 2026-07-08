import { ResumeContentSchema, type ResumeContent, type ChatMessage } from "./resume-content";
import { complete, type LlmMessage, type LlmDocument } from "./llm-provider";
import { getCareerInfo, getResumeSkill } from "./career";
import { InterviewPrepSchema, type InterviewPrepPack } from "./interview-prep-content";
import { OfferComparisonVerdictSchema, type OfferComparisonVerdict } from "./offer-comparison-content";
import { type ComparableApp } from "./offer-comparison";
import { formatPay } from "./job-fields";

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

// Nudge the model to expand or condense to hit two full pages. `lastPageFill` (0..1) is the
// fraction of the final page occupied by content; it lets the expand instruction describe an
// under-filled second page accurately instead of implying the resume is only one page.
export async function adjustForLength(
  userId: string,
  current: ResumeContent,
  direction: "expand" | "condense",
  pageCount: number,
  lastPageFill?: number,
): Promise<ResumeContent> {
  const careerInfo = await getCareerInfo(userId);
  const fillPct = lastPageFill != null ? Math.round(lastPageFill * 100) : null;
  const expandInstruction =
    pageCount === 2
      ? `The rendered resume spills onto a second page but fills only ~${fillPct ?? "<70"}% of it; it must be two ` +
        `full pages with the second page at least 70% full. Expand bullets with more specific verified detail ` +
        `(metrics, technologies, outcomes), add a 4th project if appropriate, and lengthen the summary and ` +
        `Why-Company section until the second page is full. Do not fabricate.`
      : `The rendered resume is only ${pageCount} page(s); it must be exactly 2 full pages. Expand bullets with more ` +
        `specific verified detail (metrics, technologies, outcomes), add a 4th project if appropriate, and lengthen ` +
        `the summary and Why-Company section. Do not fabricate.`;
  const instruction =
    direction === "expand"
      ? expandInstruction
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

// --- Post-interview debrief ---

type DebriefInterview = {
  round?: string | null;
  interviewer?: string | null;
  company: string;
  roleTitle: string;
};

export type DebriefSentiment = {
  fit: "strong" | "mixed" | "weak";
  greenFlags: string[];
  redFlags: string[];
  rationale: string;
};

export type DebriefSynthesis = {
  summary: string;
  actionItems: string[];
  sentiment: DebriefSentiment;
};

// Generate a few tailored gap-filling debrief questions. When a transcript is present the
// questions probe what it doesn't already reveal; without one they cover the interview broadly.
export async function generateDebriefQuestions(input: {
  userId: string;
  interview: DebriefInterview;
  transcript?: string | null;
}): Promise<string[]> {
  const { interview } = input;
  const text = await complete({
    userId: input.userId,
    maxTokens: 1000,
    json: true,
    system:
      "You help a candidate debrief after a job interview. Produce 3-5 concise, specific " +
      "questions that prompt useful reflection. If a transcript is provided, ask about things " +
      "it does NOT already make clear (fill gaps); if not, ask broadly about how it went, what " +
      "was asked, red/green flags, and open questions. Return ONLY a JSON object " +
      '{ "questions": ["...", ...] }.',
    messages: [
      {
        role: "user",
        content:
          `Company: ${interview.company}\nRole: ${interview.roleTitle}\n` +
          `Round: ${interview.round || "(unspecified)"}\n` +
          `Interviewer: ${interview.interviewer || "(unspecified)"}\n\n` +
          (input.transcript
            ? `Transcript:\n"""\n${input.transcript}\n"""\n\n`
            : "No transcript was provided.\n\n") +
          `Return JSON: { "questions": [ ... ] }.`,
      },
    ],
  });
  return parseJson<{ questions: string[] }>(text).questions;
}

// Synthesize the debrief: a summary, extracted action items, and a fit/sentiment signal,
// grounded in the transcript (if any) plus the candidate's answers to the debrief questions.
export async function synthesizeDebrief(input: {
  userId: string;
  interview: DebriefInterview;
  transcript?: string | null;
  questions: string[];
  answers: string[];
}): Promise<DebriefSynthesis> {
  const { interview } = input;
  const qa = input.questions
    .map((q, i) => `Q: ${q}\nA: ${input.answers[i] ?? ""}`)
    .join("\n\n");
  const text = await complete({
    userId: input.userId,
    maxTokens: 2000,
    json: true,
    system:
      "You synthesize a post-interview debrief for a candidate. Base everything on the " +
      "transcript (if any) and the candidate's answers — do not invent facts. Return ONLY a " +
      'JSON object with keys: summary (a concise paragraph on how it went), actionItems (a ' +
      "JSON array of concrete follow-ups / things to research / open questions, each a short " +
      "string), and sentiment (an object { fit: 'strong'|'mixed'|'weak', greenFlags: string[], " +
      "redFlags: string[], rationale: string }).",
    messages: [
      {
        role: "user",
        content:
          `Company: ${interview.company}\nRole: ${interview.roleTitle}\n` +
          `Round: ${interview.round || "(unspecified)"}\n\n` +
          (input.transcript
            ? `Transcript:\n"""\n${input.transcript}\n"""\n\n`
            : "No transcript was provided.\n\n") +
          `Debrief Q&A:\n${qa}\n\n` +
          `Return JSON with keys: summary, actionItems, sentiment.`,
      },
    ],
  });
  return parseJson<DebriefSynthesis>(text);
}

// --- Interview prep pack ---

// Generate a prep pack tailored to a specific interview round: research brief, likely
// questions with STAR answers drawn from the career profile, questions to ask, and a
// prioritized study checklist. Grounded in the career info — never fabricated.
export async function generateInterviewPrep(input: {
  userId: string;
  application: {
    company: string;
    roleTitle: string;
    jdSnapshot: string;
    seniorityLevel?: string | null;
    techStack?: string | null;
  };
  interview: { round?: string | null; interviewer?: string | null };
}): Promise<InterviewPrepPack> {
  const careerInfo = await getCareerInfo(input.userId);
  const { application: app, interview } = input;
  const text = await complete({
    userId: input.userId,
    maxTokens: 8000,
    json: true,
    system:
      "You are an interview coach preparing a candidate for a specific interview round. Produce a " +
      "tailored prep pack. Ground every suggested answer in the candidate's real career info — never " +
      "fabricate experience, metrics, or projects; if the profile lacks something, frame the answer as " +
      "how to approach it honestly. Calibrate topics and depth to the role's seniority level and tech " +
      "stack. Return ONLY a JSON object with keys: researchBrief (a concise paragraph on the role/company " +
      "and key talking points), likelyQuestions (array of { question, category, suggestedAnswer } — mix " +
      "behavioral and technical, answers STAR-style from the career info), questionsToAsk (array of " +
      "strings the candidate should ask the interviewer), studyChecklist (array of { topic, priority, " +
      "why } prioritized for this level and stack).\n\n=== CAREER INFO (source of truth) ===\n" +
      careerInfo,
    messages: [
      {
        role: "user",
        content:
          `Company: ${app.company}\nRole: ${app.roleTitle}\n` +
          `Seniority level: ${app.seniorityLevel || "(unspecified)"}\n` +
          `Tech stack: ${app.techStack || "(unspecified)"}\n` +
          `Interview round: ${interview.round || "(unspecified)"}\n` +
          `Interviewer: ${interview.interviewer || "(unspecified)"}\n\n` +
          `Job description:\n"""\n${app.jdSnapshot}\n"""\n\n` +
          `Return JSON with keys: researchBrief, likelyQuestions, questionsToAsk, studyChecklist.`,
      },
    ],
  });
  return InterviewPrepSchema.parse(parseJson<unknown>(text));
}

// --- Offer comparison ---

function formatComparableApp(a: ComparableApp): string {
  return [
    `[applicationId ${a.id}] ${a.company} — ${a.roleTitle}`,
    `  Base pay: ${formatPay(a) ?? "unspecified"}`,
    a.bonus ? `  Bonus: ${a.bonus}` : null,
    a.benefits ? `  Benefits: ${a.benefits}` : null,
    a.locationMode || a.location
      ? `  Location: ${[a.locationMode, a.location].filter(Boolean).join(" — ")}`
      : null,
    a.employmentType ? `  Employment type: ${a.employmentType}` : null,
    a.seniorityLevel ? `  Seniority: ${a.seniorityLevel}` : null,
    a.techStack ? `  Tech stack: ${a.techStack}` : null,
    a.companySize || a.companyStage || a.industry
      ? `  Company: ${[a.companySize, a.companyStage, a.industry].filter(Boolean).join(", ")}`
      : null,
    a.interestRating != null ? `  Candidate interest: ${a.interestRating}/5` : null,
    a.pros ? `  Pros: ${a.pros}` : null,
    a.cons ? `  Cons: ${a.cons}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// Weigh competing offers and produce a verdict: summary, recommendation, ranking, decision
// factors, and risks. Considers structured comp/benefits, the candidate's own pros/cons and
// interest, their career profile, optional stated priorities, and any uploaded benefits PDFs.
export async function generateOfferComparison(input: {
  userId: string;
  applications: ComparableApp[];
  priorities?: string | null;
  benefitsDocs?: LlmDocument[];
}): Promise<OfferComparisonVerdict> {
  const careerInfo = await getCareerInfo(input.userId);
  const appBlocks = input.applications.map(formatComparableApp).join("\n\n");
  const priorities = input.priorities?.trim();
  const text = await complete({
    userId: input.userId,
    maxTokens: 4000,
    json: true,
    documents: input.benefitsDocs,
    system:
      "You are a career advisor helping a candidate choose between competing job offers. Weigh the " +
      "offers against each other using the structured data, the candidate's own pros/cons and interest " +
      "ratings, their career profile, and any uploaded benefits documents. " +
      (priorities
        ? "Prioritize what the candidate says matters most, stated below.\n"
        : "In the absence of stated priorities, infer what likely matters from the career profile and per-offer notes.\n") +
      "Be decisive but honest about tradeoffs; reference the benefits documents when they change the " +
      "picture. Return ONLY a JSON object with keys: summary (a short paragraph), recommendation " +
      "({ applicationId, rationale }), ranking (array of { applicationId, rank, rationale }, rank 1 = " +
      "best), factors (array of { name, notes } covering the key decision dimensions), risks (array of " +
      "strings). Use the exact applicationId numbers given.\n\n=== CAREER PROFILE ===\n" +
      careerInfo,
    messages: [
      {
        role: "user",
        content:
          (priorities ? `The candidate's stated priorities:\n${priorities}\n\n` : "") +
          `Competing offers:\n\n${appBlocks}\n\n` +
          (input.benefitsDocs?.length
            ? `${input.benefitsDocs.length} benefits document(s) are attached; factor them in.\n\n`
            : "") +
          `Return JSON with keys: summary, recommendation, ranking, factors, risks.`,
      },
    ],
  });
  return OfferComparisonVerdictSchema.parse(parseJson<unknown>(text));
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
