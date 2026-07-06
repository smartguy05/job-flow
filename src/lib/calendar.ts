// Pure, DB-free, React-free helpers for the calendar view. The API route
// (`src/app/api/calendar/route.ts`) produces `CalendarEvent[]`; the page
// (`src/app/calendar/page.tsx`) lays them out with the grid/grouping helpers here.

export type CalendarEventType = "interview" | "deadline" | "next_action";

export type CalendarEvent = {
  type: CalendarEventType;
  date: string; // ISO timestamp
  applicationId: number;
  // Stable per-event id for building calendar UIDs. Interviews use the interview row id
  // (an application can have several); deadlines/next-actions are one-per-application, so
  // this is left undefined and UID generation falls back to applicationId.
  sourceId?: number;
  company: string | null;
  roleTitle: string;
  title: string;
  outcome?: string | null;
  status: string;
};

// A month grid as 6 weeks of 7 Dates, each week starting on Monday. Includes
// trailing days from the previous month and leading days of the next so every
// cell is a real Date. `monthIndex` is 0-based (0 = January).
export function buildMonthGrid(year: number, monthIndex: number): Date[][] {
  const first = new Date(year, monthIndex, 1);
  // getDay(): 0 = Sunday .. 6 = Saturday. Shift so Monday = 0.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - offset);

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
    }
    weeks.push(week);
  }
  return weeks;
}

// Local (not UTC) YYYY-MM-DD key, so events land on the day the user sees them.
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Inverse of dayKey: turn a local YYYY-MM-DD key back into a local Date (midnight).
// Use this instead of `new Date("YYYY-MM-DD")`, which parses as UTC and can render as the
// previous day in timezones behind UTC.
export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = dayKey(new Date(ev.date));
    const bucket = map.get(key);
    if (bucket) bucket.push(ev);
    else map.set(key, [ev]);
  }
  return map;
}

// Color palette aligned with `statusColor` in src/lib/ui.ts.
export function eventColor(ev: CalendarEvent): { bg: string; fg: string } {
  if (ev.type === "deadline") return { bg: "#fee2e2", fg: "#991b1b" }; // red
  if (ev.type === "next_action") return { bg: "#fef3c7", fg: "#92400e" }; // amber
  // interview — color by outcome
  switch (ev.outcome) {
    case "passed":
      return { bg: "#d1fae5", fg: "#065f46" }; // green
    case "failed":
      return { bg: "#fee2e2", fg: "#991b1b" }; // red
    case "cancelled":
      return { bg: "#e2e8f0", fg: "#334155" }; // slate
    default: // pending / null
      return { bg: "#dbeafe", fg: "#1e40af" }; // blue
  }
}

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  interview: "Interview",
  deadline: "Deadline",
  next_action: "Next action",
};

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545) serialization — pure, so the token-authed feed route
// (`src/app/api/calendar/feed/route.ts`) can turn CalendarEvent[] into a `.ics`
// body that Google/Apple/Outlook can subscribe to.
// ---------------------------------------------------------------------------

// Escape TEXT values per RFC 5545 §3.3.11: backslash, comma and semicolon are
// escaped, and any newline becomes a literal "\n". CR/LF are normalized first.
export function escapeICSText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Format an ISO instant for a DTSTART/DTEND/DTSTAMP value. Timed values render as a UTC
// DATE-TIME (`YYYYMMDDTHHMMSSZ`); all-day values render as a bare DATE (`YYYYMMDD`) using
// the instant's UTC calendar date — deterministic (no server-timezone dependence), at the
// cost of shifting the shown day for deadlines stored far from UTC midnight, which is
// acceptable for date-only reminders.
export function formatICSDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  if (allDay) return date;
  return `${date}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// Fold a content line to <=75 octets per RFC 5545 §3.1, continuing with CRLF + a single
// space. Splits on octet (UTF-8 byte) boundaries, not code points; adequate for our ASCII
// field content.
export function foldICSLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const out: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const ch of line) {
    const cb = Buffer.byteLength(ch, "utf8");
    // First line holds 75 octets; continuation lines hold 74 (the leading space is the 75th).
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + cb > limit) {
      out.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += ch;
    bytes += cb;
  }
  if (chunk) out.push(chunk);
  return out.join("\r\n ");
}

// A stable, globally-unique UID so calendar clients update an event in place instead of
// duplicating it when its date changes.
export function eventUID(ev: CalendarEvent): string {
  return `${ev.type}-${ev.sourceId ?? ev.applicationId}@jobflow`;
}

const ICS_SUMMARY_PREFIX: Record<CalendarEventType, string> = {
  interview: "Interview",
  deadline: "Deadline",
  next_action: "Next action",
};

function icsSummary(ev: CalendarEvent): string {
  const who = ev.company ?? ev.roleTitle;
  return `${ICS_SUMMARY_PREFIX[ev.type]}: ${who} — ${ev.title}`;
}

export type ToICSOptions = {
  calName?: string;
  baseUrl?: string;
  // Generation timestamp (DTSTAMP). Defaults to now; injectable for deterministic tests.
  dtstamp?: string;
};

// Serialize events into a complete VCALENDAR document (CRLF-terminated, folded lines).
export function toICS(events: CalendarEvent[], opts: ToICSOptions = {}): string {
  const calName = opts.calName ?? "JobFlow";
  const baseUrl = (opts.baseUrl ?? "").replace(/\/$/, "");
  const dtstamp = formatICSDate(opts.dtstamp ?? new Date().toISOString(), false);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JobFlow//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICSText(calName)}`,
  ];

  for (const ev of events) {
    const allDay = ev.type !== "interview";
    const descParts = [ev.roleTitle, ev.company, ev.status].filter(Boolean);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${eventUID(ev)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatICSDate(ev.date, true)}`);
    } else {
      lines.push(`DTSTART:${formatICSDate(ev.date, false)}`);
    }
    lines.push(`SUMMARY:${escapeICSText(icsSummary(ev))}`);
    if (descParts.length) lines.push(`DESCRIPTION:${escapeICSText(descParts.join(" · "))}`);
    if (baseUrl) lines.push(`URL:${escapeICSText(`${baseUrl}/applications/${ev.applicationId}`)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldICSLine).join("\r\n") + "\r\n";
}
