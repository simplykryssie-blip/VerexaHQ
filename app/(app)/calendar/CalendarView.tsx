"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarItem = {
  id: string;
  date: string;
  label: string;
  href?: string;
  kind: "engagement" | "task" | "appointment";
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CalendarView({ items }: { items: CalendarItem[] }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = item.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ date: new Date(year, month, i - startWeekday + 1), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }
    return cells;
  }, [cursor]);

  const todayKey = toDateKey(new Date());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-lg p-1.5 text-muted hover:bg-surfaceMuted hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surfaceMuted hover:text-ink"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-lg p-1.5 text-muted hover:bg-surfaceMuted hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium uppercase tracking-wide text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map(({ date, inMonth }, i) => {
          const key = toDateKey(date);
          const dayItems = itemsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`min-h-[104px] border-b border-r border-border p-2 text-left align-top last:border-r-0 ${
                inMonth ? "bg-surface" : "bg-surfaceMuted"
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-accent font-semibold text-white" : inMonth ? "text-slate" : "text-muted"
                }`}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayItems.slice(0, 3).map((item) =>
                  item.href ? (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="block truncate rounded bg-accentSoft px-1.5 py-0.5 text-xs font-medium text-accent hover:underline"
                      title={item.label}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <p
                      key={item.id}
                      className="truncate rounded bg-surfaceMuted px-1.5 py-0.5 text-xs font-medium text-slate"
                      title={item.label}
                    >
                      {item.label}
                    </p>
                  )
                )}
                {dayItems.length > 3 && (
                  <p className="text-xs text-muted">+{dayItems.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
