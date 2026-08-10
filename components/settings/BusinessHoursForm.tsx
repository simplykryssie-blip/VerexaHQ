"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { WEEKDAYS, type BusinessHours, type DayHours } from "@/lib/businessHours";

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

export function BusinessHoursForm({
  workspaceId,
  initialHours,
  initialSlotMinutes,
}: {
  workspaceId: string;
  initialHours: BusinessHours;
  initialSlotMinutes: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [hours, setHours] = useState<BusinessHours>(initialHours);
  const [slotMinutes, setSlotMinutes] = useState(initialSlotMinutes);
  const [saving, setSaving] = useState(false);

  function updateDay(day: keyof BusinessHours, patch: Partial<NonNullable<DayHours>> | null) {
    setHours((prev) => ({
      ...prev,
      [day]: patch === null ? null : { ...(prev[day] ?? { start: "09:00", end: "17:00" }), ...patch },
    }));
  }

  async function save() {
    setSaving(true);
    const [{ error: hoursError }, { error: slotError }] = await Promise.all([
      supabase.from("system_settings").upsert({ workspace_id: workspaceId, key: "business_hours", value: hours }, { onConflict: "workspace_id,key" }),
      supabase
        .from("system_settings")
        .upsert({ workspace_id: workspaceId, key: "booking_slot_minutes", value: slotMinutes }, { onConflict: "workspace_id,key" }),
    ]);
    setSaving(false);
    if (hoursError || slotError) {
      toast.show(hoursError?.message ?? slotError?.message ?? "Could not save.", "error");
      return;
    }
    toast.show("Booking availability saved", "success");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-muted">
        When clients can self-book a bookable service from their portal. Slot length sets the scheduling grid; each service&apos;s own duration (set on
        the service package) determines how much time a booking actually reserves.
      </p>

      <div className="mt-4 space-y-2">
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

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save availability"}
      </button>
    </div>
  );
}
