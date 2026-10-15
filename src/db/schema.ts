import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  primaryKey,
  index,
  uniqueIndex,
  customType,
  date,
  boolean,
  doublePrecision,
} from "drizzle-orm/pg-core";

const now = () => new Date();

// pg-core has no built-in bytea; standard Drizzle recipe for binary columns.
// Normalize to Buffer on read — postgres.js yields Buffer, pglite yields Uint8Array.
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
  },
});

// Authenticated users, provisioned on first OIDC login (keyed by the provider `sub`).
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  sub: text("sub").notNull().unique(), // OIDC subject claim
  email: text("email"),
  name: text("name"),
  // Unguessable per-user token for the subscribable calendar feed (/api/calendar/feed).
  // Nullable: the feed is opt-in and the token is minted on first enable. Unique so the
  // feed route can resolve the owning user in one indexed lookup.
  calendarToken: text("calendar_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
});

// Per-user key/value settings (JSON-encoded values).
export const settings = pgTable(
  "settings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(), // JSON-encoded
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    agency: text("agency"),
    email: text("email"),
    linkedin: text("linkedin"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("contacts_user_idx").on(t.userId, t.id)],
);

export const applications = pgTable(
  "applications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    companyNormalized: text("company_normalized").notNull(),
    roleTitle: text("role_title").notNull(),
    link: text("link"),
    sourceRaw: text("source_raw"), // original pasted message/JD
    jdSnapshot: text("jd_snapshot"), // cleaned job description at capture time
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("applied"), // applied | in_progress | closed_won | closed_lost | expired
    notes: text("notes"),

    // --- Compensation ---
    payMin: integer("pay_min"),
    payMax: integer("pay_max"),
    payCurrency: text("pay_currency").default("USD"),
    payPeriod: text("pay_period"), // year | hour
    bonus: text("bonus"),
    benefits: text("benefits"),

    // --- Location & type ---
    locationMode: text("location_mode"), // remote | hybrid | onsite
    location: text("location"),
    employmentType: text("employment_type"), // full-time | contract | c2h | part-time

    // --- Role & company ---
    seniorityLevel: text("seniority_level"),
    techStack: text("tech_stack"), // comma-separated
    companySize: text("company_size"),
    companyStage: text("company_stage"),
    industry: text("industry"),

    // --- Logistics (sourceChannel is distinct from sourceRaw, the raw pasted text) ---
    sourceChannel: text("source_channel"),
    datePosted: timestamp("date_posted", { withTimezone: true }),
    applicationDeadline: timestamp("application_deadline", { withTimezone: true }),
    postingId: text("posting_id"),
    referralName: text("referral_name"),

    // --- Personal tracking ---
    interestRating: integer("interest_rating"), // 1-5
    pros: text("pros"),
    cons: text("cons"),
    nextAction: text("next_action"),
    nextActionDate: timestamp("next_action_date", { withTimezone: true }),

    appliedAt: timestamp("applied_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().$defaultFn(now),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("applications_user_idx").on(t.userId, t.id)],
);

export const resumes = pgTable(
  "resumes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"), // draft | final
    contentJson: text("content_json").notNull(), // ResumeContent JSON
    chatJson: text("chat_json").notNull().default("[]"), // refinement history
    baseName: text("base_name"), // descriptive filename stem for downloads
    docxData: bytea("docx_data"), // generated DOCX bytes
    pdfData: bytea("pdf_data"), // generated PDF bytes
    pageCount: integer("page_count"),
    fitWarning: text("fit_warning"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Free-text label for the resume "variant" (e.g. "ML-heavy"); analytics groups response
    // rate by the label of the sent resume.
    variantLabel: text("variant_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("resumes_user_app_idx").on(t.userId, t.applicationId)],
);

export const interviews = pgTable(
  "interviews",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    round: text("round"), // e.g. "Recruiter screen", "Technical", "Onsite"
    interviewer: text("interviewer"),
    prepNotes: text("prep_notes"),
    outcome: text("outcome"), // pending | passed | failed | cancelled

    // --- Post-interview debrief (optional; 1:1 with the interview) ---
    // Raw transcript, from an uploaded recording (Whisper) or pasted text. Audio is
    // transcribed and discarded — never stored.
    transcript: text("transcript"),
    debriefQuestions: text("debrief_questions").notNull().default("[]"), // JSON string[]
    debriefAnswers: text("debrief_answers").notNull().default("[]"), // JSON string[] aligned to questions
    debriefSummary: text("debrief_summary"),
    debriefActionItems: text("debrief_action_items").notNull().default("[]"), // JSON string[]
    debriefSentiment: text("debrief_sentiment"), // JSON { fit, greenFlags, redFlags, rationale }
    debriefAt: timestamp("debrief_at", { withTimezone: true }), // set when synthesis completes

    // --- AI interview prep pack (optional; regenerable and hand-editable) ---
    // Full pack stored as one JSON blob (see src/lib/interview-prep-content.ts):
    // { researchBrief, likelyQuestions[], questionsToAsk[], studyChecklist[] }.
    prepPackJson: text("prep_pack_json"),
    prepGeneratedAt: timestamp("prep_generated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("interviews_user_app_idx").on(t.userId, t.applicationId)],
);

// Binary documents a user uploads against an application (currently benefits paperwork,
// PDF). Sent to the model as native document blocks during offer comparison. Bytes live in
// Postgres bytea like generated resume blobs.
export const applicationFiles = pgTable(
  "application_files",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("benefits"), // benefits | resume | cover_letter | message | offer_letter | misc
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(), // bytes
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("application_files_user_app_idx").on(t.userId, t.applicationId)],
);

// Saved offer comparisons. `resultJson` snapshots the deterministic table + AI verdict at
// generation time so a saved comparison stays stable even if the underlying applications
// later change or are deleted (hence applicationIds is stored as JSON, not a FK).
export const offerComparisons = pgTable(
  "offer_comparisons",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    applicationIds: text("application_ids").notNull(), // JSON number[]
    priorities: text("priorities"), // optional free-text steering
    resultJson: text("result_json").notNull(), // JSON { table, verdict }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("offer_comparisons_user_idx").on(t.userId, t.id)],
);

// Activity log: powers "last activity", the timeline on the detail page, and analytics.
export const events = pgTable(
  "events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // created | status_change | resume_generated | resume_sent | interview | note | reminder_sent | email
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("events_user_app_idx").on(t.userId, t.applicationId)],
);

export const messageDrafts = pgTable(
  "message_drafts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // reply | cover_letter | follow_up
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("message_drafts_user_app_idx").on(t.userId, t.applicationId)],
);

// One row per user: the master career-info markdown that resume generation draws from.
export const careerProfile = pgTable("career_profile", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
});

// Supplementary source documents a user supplies; their text is folded into the
// generation context alongside the career profile.
export const careerFiles = pgTable(
  "career_files",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    content: text("content").notNull(), // extracted / pasted text used for generation
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("career_files_user_idx").on(t.userId, t.id)],
);

// One row per user: the editable "skill" instructions that steer resume generation.
// Empty/absent falls back to the shipped default SKILL.md at generation time.
export const resumeSkill = pgTable("resume_skill", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
});

// Questions the user wants to ask interviewers. applicationId NULL = a general question
// that applies to every job; otherwise it is specific to that one application.
export const interviewQuestions = pgTable(
  "interview_questions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    text: text("text").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("interview_questions_user_app_idx").on(t.userId, t.applicationId)],
);

// Per-job check state + notes for a question (general or job-specific). One row per
// (application, question); absent row = unchecked with no notes.
export const applicationQuestionState = pgTable(
  "application_question_state",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => interviewQuestions.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }), // null = unchecked
    notes: text("notes").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("app_question_state_uniq").on(t.applicationId, t.questionId)],
);

// --- Employment history: jobs the user has held, with comp, benefits and a work journal ---

// One row per position held. applicationId links a job created from a won application
// (unique per user so auto-creation on closed_won is idempotent). endDate null = current.
export const jobs = pgTable(
  "jobs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => applications.id, { onDelete: "set null" }),
    company: text("company").notNull(),
    companyNormalized: text("company_normalized").notNull(),
    title: text("title").notNull(),
    startDate: date("start_date", { mode: "string" }), // YYYY-MM-DD
    endDate: date("end_date", { mode: "string" }), // null = current job
    employmentType: text("employment_type"),
    locationMode: text("location_mode"),
    location: text("location"),
    manager: text("manager"),
    team: text("team"),
    technologies: text("technologies").notNull().default("[]"), // JSON string[]
    reasonForLeaving: text("reason_for_leaving"),
    notes: text("notes"),
    // Next performance review (feeds the calendar as a `review` event and the reminder sweep).
    nextReviewDate: date("next_review_date", { mode: "string" }),
    // The nextReviewDate a reminder was last sent for, so each review is nudged once.
    reviewRemindedFor: date("review_reminded_for", { mode: "string" }),
    // When the job's facts were last folded into the career profile (null = never / edited since).
    profileSyncedAt: timestamp("profile_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [
    index("jobs_user_idx").on(t.userId, t.id),
    uniqueIndex("jobs_user_application_uq").on(t.userId, t.applicationId),
  ],
);

// Compensation timeline for a job: starting pay, raises, promotions, bonus payouts, grants.
export const jobCompensation = pgTable(
  "job_compensation",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date", { mode: "string" }),
    kind: text("kind").notNull().default("start"), // start | raise | promotion | adjustment | bonus_payout | equity_grant
    title: text("title"), // new title, when a promotion changes it
    baseAmount: integer("base_amount"),
    currency: text("currency").notNull().default("USD"),
    period: text("period").notNull().default("year"), // year | hour
    bonus: text("bonus"),
    equity: text("equity"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("job_compensation_user_job_idx").on(t.userId, t.jobId)],
);

// One row per job: the benefits package as held.
export const jobBenefits = pgTable("job_benefits", {
  jobId: integer("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  health: text("health"),
  retirement: text("retirement"),
  ptoDays: integer("pto_days"),
  parentalLeave: text("parental_leave"),
  remotePolicy: text("remote_policy"),
  other: text("other"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
});

// Work journal: dated achievements, feedback, complaints and notes for a job. syncedAt marks
// entries already folded into the career profile (null = pending a profile sync).
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    entryDate: date("entry_date", { mode: "string" }),
    kind: text("kind").notNull().default("achievement"), // achievement | feedback | complaint | note
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    impact: text("impact"), // measurable result, e.g. "cut p95 latency 40%"
    technologies: text("technologies").notNull().default("[]"), // JSON string[]
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("journal_entries_user_job_idx").on(t.userId, t.jobId)],
);

// --- Career growth (post-hire): people, 1:1s, performance reviews, goals ---

// People around a job: managers (history = manager rows with their date ranges), skips,
// peers, reports, mentors, stakeholders. `notes` is private and never sent to the LLM.
export const jobPeople = pgTable(
  "job_people",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationship: text("relationship").notNull().default("peer"), // manager | skip | peer | report | mentor | stakeholder
    title: text("title"),
    email: text("email"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("job_people_user_job_idx").on(t.userId, t.jobId)],
);

// 1:1 meetings for a job, optionally with one person. Notes are private (never sent to the
// LLM); actionItems is a JSON `{ text, done }[]`.
export const oneOnOnes = pgTable(
  "one_on_ones",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    personId: integer("person_id").references(() => jobPeople.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }),
    notes: text("notes").notNull().default(""),
    actionItems: text("action_items").notNull().default("[]"), // JSON { text, done }[]
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("one_on_ones_user_job_idx").on(t.userId, t.jobId)],
);

// Performance reviews received. compensationId optionally links the raise/promotion row
// that came out of the cycle (`outcome` and that link are private).
export const performanceReviews = pgTable(
  "performance_reviews",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    cycle: text("cycle").notNull(), // e.g. "2026 mid-year"
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    rating: text("rating"),
    reviewer: text("reviewer"),
    summary: text("summary"),
    strengths: text("strengths"),
    growthAreas: text("growth_areas"),
    outcome: text("outcome"),
    compensationId: integer("compensation_id").references(() => jobCompensation.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("performance_reviews_user_job_idx").on(t.userId, t.jobId)],
);

// Goals / OKRs for a job. keyResults is a JSON `{ text, done }[]`.
export const goals = pgTable(
  "goals",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    period: text("period"), // e.g. "2026-H2"
    status: text("status").notNull().default("active"), // active | done | dropped
    progress: integer("progress").notNull().default(0), // 0–100
    keyResults: text("key_results").notNull().default("[]"), // JSON { text, done }[]
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("goals_user_job_idx").on(t.userId, t.jobId)],
);

// --- Post-hire, part 2: equity grants, PTO, job documents ---

// Equity grants for a job. The vesting schedule is derived (src/lib/vesting.ts), never stored.
// Private: never sent to the LLM or the profile sync.
export const equityGrants = pgTable(
  "equity_grants",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("RSU"), // RSU | ISO | NSO | ESPP | other
    grantDate: date("grant_date", { mode: "string" }),
    shares: integer("shares").notNull(),
    strikePrice: doublePrecision("strike_price"), // per share, options only
    vestStart: date("vest_start", { mode: "string" }), // null = grantDate
    cliffMonths: integer("cliff_months").notNull().default(12),
    vestMonths: integer("vest_months").notNull().default(48),
    frequency: text("frequency").notNull().default("monthly"), // monthly | quarterly | annual
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("equity_grants_user_job_idx").on(t.userId, t.jobId)],
);

// Time off taken or planned at a job. `days` defaults to the weekdays in the range; the
// balance against job_benefits.pto_days is derived (src/lib/pto.ts). Private.
export const ptoEntries = pgTable(
  "pto_entries",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    days: doublePrecision("days").notNull().default(0),
    kind: text("kind").notNull().default("vacation"), // vacation | sick | holiday | other
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("pto_entries_user_job_idx").on(t.userId, t.jobId)],
);

// Documents kept against a job (offer letter, handbook, contract, review, misc): PDF or DOCX,
// bytes in Postgres bytea like application_files. Store-and-download only; never sent to
// the LLM.
export const jobFiles = pgTable(
  "job_files",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("misc"), // offer_letter | handbook | contract | review | misc
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(), // bytes
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("job_files_user_job_idx").on(t.userId, t.jobId)],
);

// Prior inventions / original works of authorship — the "Exhibit A" a user attaches to an
// employer's invention-assignment agreement. Private unless includeInResume opts an entry
// into resume-generation context (see getCareerInfo).
export const inventions = pgTable(
  "inventions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    inventionDate: text("invention_date"), // free text: "2019", "2019–2021", "Mar 2020"
    identifier: text("identifier"), // repo URL, patent / application number
    kind: text("kind").notNull().default("software"), // software | invention | authorship | other
    technologies: text("technologies").notNull().default("[]"), // JSON string[]
    includeInResume: boolean("include_in_resume").notNull().default(false),
    notes: text("notes"), // private, never exported
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("inventions_user_sort_idx").on(t.userId, t.sortOrder)],
);

// Emails handed to JobFlow over MCP (Claude reads the user's mailbox with its own connector;
// JobFlow never holds mail credentials and never stores message bodies). One row per
// (user, provider message id): the unique key is what makes ingest idempotent, and
// `appliedAt` is claimed atomically so a message's actions are never applied twice.
export const ingestedEmails = pgTable(
  "ingested_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(), // provider message id (e.g. Gmail's)
    applicationId: integer("application_id").references(() => applications.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // rejection | interview_invite | recruiter_reply | offer | application_ack | other
    summary: text("summary").notNull().default(""),
    fromAddress: text("from_address"),
    subject: text("subject"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    actions: text("actions"), // JSON EmailAction[] that were applied
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("ingested_emails_user_message_uq").on(t.userId, t.messageId),
    index("ingested_emails_user_processed_idx").on(t.userId, t.processedAt),
  ],
);
