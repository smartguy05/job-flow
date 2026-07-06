"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, fmtDate } from "@/lib/ui";
import {
  buildMonthGrid,
  dayKey,
  dayKeyToDate,
  eventsByDay,
  eventColor,
  EVENT_TYPE_LABELS,
  type CalendarEvent,
  type CalendarEventType,
} from "@/lib/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 2;

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string>(() => dayKey(new Date()));

  useEffect(() => {
    api<CalendarEvent[]>("/api/calendar")
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  const byDay = useMemo(() => eventsByDay(events), [events]);
  const grid = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const todayKey = dayKey(today);

  const selectedEvents = (byDay.get(selected) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => new Date(e.date) >= new Date(todayKey))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10),
    [events, todayKey],
  );

  const goMonth = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(todayKey);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
          <span className="font-semibold min-w-[10rem] text-center">{monthLabel(cursor)}</span>
          <button className="btn btn-ghost" onClick={() => goMonth(1)} aria-label="Next month">›</button>
          <button className="btn btn-ghost" onClick={goToday}>Today</button>
        </div>
      </div>

      <Legend />

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 text-xs font-semibold" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="p-2 text-center">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.flat().map((day) => {
              const key = dayKey(day);
              const dayEvents = byDay.get(key) ?? [];
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className="text-left border-t border-l p-1.5 min-h-[5.5rem] flex flex-col gap-1 hover:opacity-90"
                  style={{
                    borderColor: "var(--border)",
                    background: isSelected ? "var(--surface-2)" : "var(--surface)",
                    opacity: inMonth ? 1 : 0.4,
                  }}
                >
                  <span
                    className="text-xs font-semibold self-start rounded-full w-6 h-6 flex items-center justify-center"
                    style={isToday ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.slice(0, MAX_CHIPS).map((ev, i) => {
                    const c = eventColor(ev);
                    return (
                      <span key={i} className="badge truncate w-full" style={{ background: c.bg, color: c.fg }}>
                        {ev.title}
                      </span>
                    );
                  })}
                  {dayEvents.length > MAX_CHIPS && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>+{dayEvents.length - MAX_CHIPS} more</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {selectedEvents.length > 0 ? (
          <>
            <h2 className="font-semibold">{fmtDate(dayKeyToDate(selected))}</h2>
            {selectedEvents.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </>
        ) : (
          <>
            <h2 className="font-semibold">
              Nothing on {fmtDate(dayKeyToDate(selected))} · <span style={{ color: "var(--muted)" }}>upcoming</span>
            </h2>
            {upcoming.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No upcoming events.</p>
            ) : (
              upcoming.map((ev, i) => <EventRow key={i} ev={ev} showDate />)
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EventRow({ ev, showDate }: { ev: CalendarEvent; showDate?: boolean }) {
  const c = eventColor(ev);
  return (
    <Link
      href={`/applications/${ev.applicationId}`}
      className="card p-3 flex items-center gap-3 hover:opacity-90"
    >
      <span className="badge whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
        {EVENT_TYPE_LABELS[ev.type]}
      </span>
      <span className="font-semibold">{ev.title}</span>
      <span style={{ color: "var(--muted)" }}>
        {ev.company ? `${ev.company} — ${ev.roleTitle}` : ev.roleTitle}
      </span>
      {showDate && <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>{fmtDate(ev.date)}</span>}
    </Link>
  );
}

function Legend() {
  const items: { type: CalendarEventType; label: string }[] = [
    { type: "interview", label: "Interview" },
    { type: "deadline", label: "Deadline" },
    { type: "next_action", label: "Next action" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-sm" style={{ color: "var(--muted)" }}>
      {items.map(({ type, label }) => {
        const c = eventColor({ type, outcome: "pending" } as CalendarEvent);
        return (
          <span key={type} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: c.bg, border: `1px solid ${c.fg}` }} />
            {label}
          </span>
        );
      })}
    </div>
  );
}
