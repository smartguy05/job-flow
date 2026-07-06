import { describe, it, expect } from "vitest";
import {
  buildMonthGrid,
  dayKey,
  dayKeyToDate,
  eventsByDay,
  eventColor,
  escapeICSText,
  formatICSDate,
  foldICSLine,
  eventUID,
  toICS,
  type CalendarEvent,
} from "./calendar";

function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    type: "interview",
    date: "2026-07-03T15:00:00.000Z",
    applicationId: 1,
    company: "Globex",
    roleTitle: "AI Engineer",
    title: "Technical",
    status: "in_progress",
    ...over,
  };
}

describe("buildMonthGrid", () => {
  it("returns a 6x7 grid of Dates", () => {
    const grid = buildMonthGrid(2026, 6); // July 2026
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
    for (const week of grid) for (const d of week) expect(d).toBeInstanceOf(Date);
  });

  it("starts each week on Monday", () => {
    const grid = buildMonthGrid(2026, 6);
    for (const week of grid) expect(week[0].getDay()).toBe(1); // Monday
  });

  it("includes leading days from the previous month", () => {
    // July 1 2026 is a Wednesday, so the grid should start on Mon Jun 29 2026.
    const grid = buildMonthGrid(2026, 6);
    const first = grid[0][0];
    expect(first.getFullYear()).toBe(2026);
    expect(first.getMonth()).toBe(5); // June
    expect(first.getDate()).toBe(29);
  });

  it("includes the first of the month in the first week", () => {
    const grid = buildMonthGrid(2026, 6);
    const has = grid[0].some((d) => d.getMonth() === 6 && d.getDate() === 1);
    expect(has).toBe(true);
  });

  it("covers a leap-year February", () => {
    const grid = buildMonthGrid(2024, 1); // Feb 2024 (leap year)
    const feb29 = grid.flat().some((d) => d.getMonth() === 1 && d.getDate() === 29);
    expect(feb29).toBe(true);
  });
});

describe("dayKey", () => {
  it("formats a local YYYY-MM-DD key", () => {
    // Construct with local components so the assertion is timezone-stable.
    const d = new Date(2026, 6, 3);
    expect(dayKey(d)).toBe("2026-07-03");
  });

  it("zero-pads month and day", () => {
    const d = new Date(2026, 0, 5);
    expect(dayKey(d)).toBe("2026-01-05");
  });
});

describe("dayKeyToDate", () => {
  it("round-trips with dayKey in local time", () => {
    const d = new Date(2026, 6, 6);
    expect(dayKey(dayKeyToDate(dayKey(d)))).toBe("2026-07-06");
  });

  it("does not shift the day (unlike new Date(YYYY-MM-DD))", () => {
    // The whole point: the key's day must survive as a local calendar day.
    const back = dayKeyToDate("2026-07-06");
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(6);
    expect(back.getDate()).toBe(6);
  });
});

describe("eventsByDay", () => {
  it("groups events under their local day key", () => {
    const d = new Date(2026, 6, 3, 10, 0);
    const events = [
      ev({ date: d.toISOString(), title: "A" }),
      ev({ date: d.toISOString(), title: "B" }),
      ev({ date: new Date(2026, 6, 4, 9).toISOString(), title: "C" }),
    ];
    const map = eventsByDay(events);
    expect(map.get("2026-07-03")).toHaveLength(2);
    expect(map.get("2026-07-04")).toHaveLength(1);
  });
});

describe("eventColor", () => {
  it("colors interviews by outcome", () => {
    const passed = eventColor(ev({ type: "interview", outcome: "passed" }));
    const failed = eventColor(ev({ type: "interview", outcome: "failed" }));
    expect(passed.bg).not.toBe(failed.bg);
  });

  it("gives deadlines and next-actions distinct colors from interviews", () => {
    const interview = eventColor(ev({ type: "interview", outcome: "pending" }));
    const deadline = eventColor(ev({ type: "deadline" }));
    const nextAction = eventColor(ev({ type: "next_action" }));
    expect(deadline.bg).not.toBe(interview.bg);
    expect(nextAction.bg).not.toBe(interview.bg);
    expect(deadline.bg).not.toBe(nextAction.bg);
  });

  it("returns bg and fg colors", () => {
    const c = eventColor(ev());
    expect(typeof c.bg).toBe("string");
    expect(typeof c.fg).toBe("string");
  });
});

describe("escapeICSText", () => {
  it("escapes backslash, comma, semicolon and newlines per RFC 5545", () => {
    expect(escapeICSText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    expect(escapeICSText("line1\nline2")).toBe("line1\\nline2");
    expect(escapeICSText("crlf\r\nhere")).toBe("crlf\\nhere");
  });
});

describe("formatICSDate", () => {
  it("formats a timed value as a UTC timestamp with Z", () => {
    expect(formatICSDate("2026-07-10T15:00:00.000Z", false)).toBe("20260710T150000Z");
  });

  it("formats an all-day value as a bare UTC date", () => {
    expect(formatICSDate("2026-08-01T00:00:00.000Z", true)).toBe("20260801");
  });
});

describe("foldICSLine", () => {
  it("leaves short lines untouched", () => {
    expect(foldICSLine("SUMMARY:hi")).toBe("SUMMARY:hi");
  });

  it("folds lines longer than 75 octets with CRLF + space", () => {
    const long = "SUMMARY:" + "x".repeat(200);
    const folded = foldICSLine(long);
    expect(folded).toContain("\r\n ");
    // No physical line may exceed 75 octets.
    for (const physical of folded.split("\r\n")) {
      expect(Buffer.byteLength(physical, "utf8")).toBeLessThanOrEqual(75);
    }
    // Unfolding (strip CRLF+space) restores the original.
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });
});

describe("eventUID", () => {
  it("uses the interview id for interviews", () => {
    expect(eventUID(ev({ type: "interview", applicationId: 7, sourceId: 42 }))).toBe("interview-42@jobflow");
  });

  it("falls back to applicationId for deadlines and next actions", () => {
    expect(eventUID(ev({ type: "deadline", applicationId: 7, sourceId: undefined }))).toBe("deadline-7@jobflow");
    expect(eventUID(ev({ type: "next_action", applicationId: 9, sourceId: undefined }))).toBe("next_action-9@jobflow");
  });

  it("is stable regardless of the event date", () => {
    const a = eventUID(ev({ type: "interview", sourceId: 5, date: "2026-07-10T15:00:00.000Z" }));
    const b = eventUID(ev({ type: "interview", sourceId: 5, date: "2026-09-01T09:00:00.000Z" }));
    expect(a).toBe(b);
  });
});

describe("toICS", () => {
  const opts = { dtstamp: "2026-07-06T12:00:00.000Z", baseUrl: "https://jobflow.test" };

  it("wraps events in a VCALENDAR with one VEVENT each", () => {
    const ics = toICS([ev({ sourceId: 1 }), ev({ type: "deadline", applicationId: 2, sourceId: undefined })], opts);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    // CRLF line endings per spec.
    expect(ics).toContain("\r\n");
  });

  it("emits an empty but valid calendar for no events", () => {
    const ics = toICS([], opts);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("gives interviews a timed DTSTART and deadlines an all-day DTSTART", () => {
    const interview = toICS([ev({ type: "interview", sourceId: 1, date: "2026-07-10T15:00:00.000Z" })], opts);
    expect(interview).toContain("DTSTART:20260710T150000Z");

    const deadline = toICS([ev({ type: "deadline", applicationId: 2, sourceId: undefined, date: "2026-08-01T00:00:00.000Z" })], opts);
    expect(deadline).toContain("DTSTART;VALUE=DATE:20260801");
  });

  it("includes a stable UID and the DTSTAMP", () => {
    const ics = toICS([ev({ type: "interview", sourceId: 42 })], opts);
    expect(ics).toContain("UID:interview-42@jobflow");
    expect(ics).toContain("DTSTAMP:20260706T120000Z");
  });

  it("escapes special characters in the summary", () => {
    const ics = toICS([ev({ type: "next_action", applicationId: 3, sourceId: undefined, title: "Call recruiter; ask about pay, benefits" })], opts);
    expect(ics).toContain("\\;");
    expect(ics).toContain("\\,");
  });

  it("links each event back to its application", () => {
    const ics = toICS([ev({ sourceId: 1, applicationId: 55 })], opts);
    expect(ics).toContain("https://jobflow.test/applications/55");
  });
});
