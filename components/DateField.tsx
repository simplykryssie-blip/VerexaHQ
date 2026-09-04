"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Calendar popover that only commits a date on an explicit Apply tap --
// unlike a native <input type="date">, clicking a day doesn't save or
// close anything by itself, so a scroll/tap in transit can't trigger a
// premature write to fields that save on selection.
export function DateField({
  value,
  onApply,
  disabled,
  placeholder = "Not set",
  className = "",
}: {
  value: string | null;
  onApply: (next: string | null) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(value);
  const [cursor, setCursor] = useState(() => (value ? parseDateKey(value) : new Date()));
  const [saving, setSaving] = useState(false);
  const containerRef = useDropdownDismiss<HTMLDivElement>(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    setPending(value);
    setCursor(value ? parseDateKey(value) : new Date());
  }, [open, value]);

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

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = toDateKey(new Date());

  async function apply() {
    setSaving(true);
    await onApply(pending);
    setSaving(false);
    setOpen(false);
  }

  // Clear commits and closes immediately, unlike picking a day -- otherwise
  // it only staged `pending` to null, and closing any other way (Cancel,
  // clicking outside) silently discarded it and left the original date in
  // place, making Clear look like it did nothing.
  async function clear() {
    setSaving(true);
    await onApply(null);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm text-slate hover:bg-surfaceMuted disabled:opacity-60"
      >
        <CalendarIcon size={14} className="text-muted" />
        {value ? parseDateKey(value).toLocaleDateString() : placeholder}
      </button>

      {open && (
        <DropdownPanel className="mt-1 w-72 p-3">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded-lg p-1 text-muted hover:bg-surfaceMuted hover:text-ink"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-ink">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded-lg p-1 text-muted hover:bg-surfaceMuted hover:text-ink"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map(({ date, inMonth }, i) => {
              const key = toDateKey(date);
              const isSelected = key === pending;
              const isToday = key === todayKey;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPending(key)}
                  className={`h-8 rounded-lg text-xs ${
                    isSelected
                      ? "bg-accent font-semibold text-white"
                      : isToday
                        ? "border border-accent text-accent"
                        : inMonth
                          ? "text-slate hover:bg-surfaceMuted"
                          : "text-muted/50 hover:bg-surfaceMuted"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <button type="button" onClick={clear} disabled={saving} className="text-xs font-medium text-muted hover:text-ink disabled:opacity-60">
              {saving ? "Clearing..." : "Clear"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Apply"}
              </button>
            </div>
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
