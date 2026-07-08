import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  primaryKey,
  index,
  customType,
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

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(now),
  },
  (t) => [index("interviews_user_app_idx").on(t.userId, t.applicationId)],
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
    type: text("type").notNull(), // created | status_change | resume_generated | resume_sent | interview | note | reminder_sent
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
