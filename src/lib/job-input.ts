import { normalizeCompany } from "@/lib/dedup";
import { JOB_COMP_KINDS, JOURNAL_KINDS, techField } from "@/lib/jobs";

// Request-body parsing for the jobs / compensation / benefits / journal routes. Each picks
// only the fields present in the body, so the same parser serves POST (create) and PATCH.

type Body = Record<string, unknown>;
type Parsed = { values: Record<string, unknown>; error?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function int(v: unknown): number | null | "invalid" {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s$]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : "invalid";
}

function parse(
  body: Body,
  spec: {
    text?: string[];
    required?: string[];
    dates?: string[];
    ints?: string[];
    enums?: Record<string, readonly string[]>;
    tech?: boolean;
  },
  create: boolean,
): Parsed {
  const values: Record<string, unknown> = {};
  for (const k of spec.required ?? []) {
    if (body[k] !== undefined || create) {
      const v = text(body[k]);
      if (!v) return { values, error: `${k} required` };
      values[k] = v;
    }
  }
  for (const k of spec.text ?? []) if (body[k] !== undefined) values[k] = text(body[k]);
  for (const k of spec.dates ?? []) {
    if (body[k] === undefined) continue;
    const v = text(body[k]);
    if (v && !ISO_DATE.test(v)) return { values, error: `${k} must be YYYY-MM-DD` };
    values[k] = v;
  }
  for (const k of spec.ints ?? []) {
    if (body[k] === undefined) continue;
    const v = int(body[k]);
    if (v === "invalid") return { values, error: `${k} must be a number` };
    values[k] = v;
  }
  for (const [k, allowed] of Object.entries(spec.enums ?? {})) {
    if (body[k] === undefined) continue;
    const v = text(body[k]);
    if (!v || !allowed.includes(v)) return { values, error: `${k} must be one of ${allowed.join(", ")}` };
    values[k] = v;
  }
  if (spec.tech && body.technologies !== undefined) values.technologies = techField(body.technologies);
  return { values };
}

export function jobInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  const r = parse(
    body,
    {
      required: ["company", "title"],
      text: ["employmentType", "locationMode", "location", "manager", "team", "reasonForLeaving", "notes"],
      dates: ["startDate", "endDate"],
      tech: true,
    },
    !!opts.create,
  );
  if (!r.error && typeof r.values.company === "string") r.values.companyNormalized = normalizeCompany(r.values.company);
  return r;
}

export function compInput(body: Body): Parsed {
  return parse(
    body,
    {
      enums: { kind: JOB_COMP_KINDS, period: ["year", "hour"] },
      ints: ["baseAmount"],
      dates: ["effectiveDate"],
      text: ["title", "currency", "bonus", "equity", "notes"],
    },
    false,
  );
}

export function benefitsInput(body: Body): Parsed {
  return parse(
    body,
    { ints: ["ptoDays"], text: ["health", "retirement", "parentalLeave", "remotePolicy", "other"] },
    false,
  );
}

export function journalInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  const r = parse(
    body,
    { required: ["title"], enums: { kind: JOURNAL_KINDS }, dates: ["entryDate"], text: ["impact"], tech: true },
    !!opts.create,
  );
  if (!r.error && body.body !== undefined) r.values.body = typeof body.body === "string" ? body.body : "";
  return r;
}
