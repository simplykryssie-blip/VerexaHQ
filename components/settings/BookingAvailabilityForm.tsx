"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { WEEKDAYS, BOOKING_WINDOW_DAYS, type BusinessHours, type DayHours, type HolidayRange } from "@/lib/businessHours";

const DAY_LABELS: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};
const SLOT_OPTIONS = [15, 30, 45, 60];

export function BookingAvailabilityForm({
  workspaceId,
  initialHours,
  initialSlotMinutes,
  initialHolidays,
  initialWindowDays,
  initialMinNoticeHours,
  initialBufferMinutes,
}: {
  workspaceId: string;
  initialHours: BusinessHours;
  initialSlotMinutes: number;
  initialHolidays: HolidayRange[];
  initialWindowDays: number;
  initialMinNoticeHours: number;
  initialBufferMinutes: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [hours, setHours] = useState<BusinessHours>(initialHours);
  const [slotMinutes, setSlotMinutes] = useState(initialSlotMinutes);
  const [holidays, setHolidays] = useState<HolidayRange[]>(initialHolidays);
  const [newHolidayStart, setNewHolidayStart] = useState("");
  const [newHolidayEnd, setNewHolidayEnd] = useState("");
  const [windowDays, setWindowDays] = useState(String(initialWindowDays));
  const [minNoticeHours, setMinNoticeHours] = useState(String(initialMinNoticeHours));
  const [bufferMinutes, setBufferMinutes] = useState(String(initialBufferMinutes));
  const [saving, setSaving] = useState(false);

  function addHoliday() {
    if (!newHolidayStart) return;
    // No end date entered -- a single-day closure, same as start.
    const end = newHolidayEnd && newHolidayEnd >= newHolidayStart ? newHolidayEnd : newHolidayStart;
    const range = { start: newHolidayStart, end };
    if (holidays.some((h) => h.start === range.start && h.end === range.end)) return;
    setHolidays((prev) => [...prev, range].sort((a, b) => a.start.localeCompare(b.start)));
    setNewHolidayStart("");
    setNewHolidayEnd("");
  }

  function removeHoliday(index: number) {
    setHolidays((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDay(day: keyof BusinessHours, patch: Partial<NonNullable<DayHours>> | null) {
    setHours((prev) => ({
      ...prev,
      [day]: patch === null ? null : { ...(prev[day] ?? { start: "09:00", end: "17:00" }), ...patch },
    }));
  }

  async function save() {
    setSaving(true);
    const results = await Promise.all([
      supabase.from("system_settings").upsert({ workspace_id: workspaceId, key: "business_hours", value: hours }, { onConflict: "workspace_id,key" }),
      supabase
        .from("system_settings")
        .upsert({ workspace_id: workspaceId, key: "booking_slot_minutes", value: slotMinutes }, { onConflict: "workspace_id,key" }),
      supabase.from("system_settings").upsert({ workspace_id: workspaceId, key: "holidays", value: holidays }, { onConflict: "workspace_id,key" }),
      supabase
        .from("system_settings")
        .upsert(
          { workspace_id: workspaceId, key: "booking_window_days", value: Number(windowDays) || BOOKING_WINDOW_DAYS },
          { onConflict: "workspace_id,key" }
        ),
      supabase
        .from("system_settings")
        .upsert(
          { workspace_id: workspaceId, key: "booking_min_notice_hours", value: Number(minNoticeHours) || 0 },
          { onConflict: "workspace_id,key" }
        ),
      supabase
        .from("system_settings")
        .upsert(
          { workspace_id: workspaceId, key: "booking_buffer_minutes", value: Number(bufferMinutes) || 0 },
          { onConflict: "workspace_id,key" }
        ),
    ]);
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.show(failed.error.message, "error");
      return;
    }
    toast.show("Saved", "success");
    router.refresh();
  }

  return (
    <SettingsCard
      title="Booking availability"
      description="When clients can self-book a bookable service from their portal. Slot length sets the scheduling grid; each service's own duration determines how much time a booking actually reserves."
    >
      <div className="space-y-2">
        {WEEKDAYS.map((day) => {
          const open = hours[day];
          return (
            <div key={day} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
              <label className="flex w-32 items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={Boolean(open)}
                  onChange={(e) => updateDay(day, e.target.checked ? {} : null)}
                  className="h-4 w-4 rounded border-border"
                />
                {DAY_LABELS[day]}
              </label>
              {open ? (
                <div className="flex items-center gap-2 text-sm text-slate">
                  <input
                    type="time"
                    value={open.start}
                    onChange={(e) => updateDay(day, { start: e.target.value })}
                    className="rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-muted">to</span>
                  <input
                    type="time"
                    value={open.end}
                    onChange={(e) => updateDay(day, { end: e.target.value })}
                    className="rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <label className="text-sm font-medium text-ink" htmlFor="slot-minutes">
          Slot length
        </label>
        <select
          id="slot-minutes"
          value={slotMinutes}
          onChange={(e) => setSlotMinutes(Number(e.target.value))}
          className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {SLOT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Booking window (days ahead)
          <input
            type="number"
            min={1}
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Minimum notice (hours)
          <input
            type="number"
            min={0}
            value={minNoticeHours}
            onChange={(e) => setMinNoticeHours(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Buffer between bookings (minutes)
          <input
            type="number"
            min={0}
            value={bufferMinutes}
            onChange={(e) => setBufferMinutes(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        How far ahead clients can book, how much advance notice you need before a booking, and how much breathing
        room to leave between appointments.
      </p>

      <div className="mt-4">
        <p className="text-sm font-medium text-ink">Holidays / office closures</p>
        <p className="mt-0.5 text-xs text-muted">
          Dates the office is closed regardless of the day of week -- skipped by both due-date calculations and client
          self-booking.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {holidays.length === 0 && <span className="text-sm text-muted">No holidays added yet.</span>}
          {holidays.map((h, i) => {
            const startLabel = new Date(`${h.start}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
            const endLabel = new Date(`${h.end}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
            return (
              <span
                key={`${h.start}-${h.end}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surfaceMuted px-3 py-1 text-sm text-ink"
              >
                {h.start === h.end ? startLabel : `${startLabel} – ${endLabel}`}
                <button
                  type="button"
                  onClick={() => removeHoliday(i)}
                  aria-label={`Remove ${startLabel}`}
                  className="text-muted hover:text-danger"
                >
                  &times;
                </button>
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Start
            <input
              type="date"
              value={newHolidayStart}
              onChange={(e) => setNewHolidayStart(e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            End (optional)
            <input
              type="date"
              value={newHolidayEnd}
              min={newHolidayStart || undefined}
              onChange={(e) => setNewHolidayEnd(e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <button
            type="button"
            onClick={addHoliday}
            disabled={!newHolidayStart}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surfaceMuted disabled:opacity-60"
          >
            Add
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">Leave End blank for a single closed day, or set it to close for a span of days.</p>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </SettingsCard>
  );
}
