"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TIMEZONE_OPTIONS } from "@/lib/timezoneOptions";
import { WEEKDAYS, type BusinessHours, type DayHours } from "@/lib/businessHours";

const DAY_LABELS: Record<string, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

export type StaffScheduleRow = {
  id: string;
  label: string;
  timezone: string | null;
  hours: BusinessHours | null;
};

const inputClass = "rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const DEFAULT_DAY: DayHours = { start: "09:00", end: "17:00" };
const BLANK_HOURS: BusinessHours = {
  sunday: null,
  monday: DEFAULT_DAY,
  tuesday: DEFAULT_DAY,
  wednesday: DEFAULT_DAY,
  thursday: DEFAULT_DAY,
  friday: DEFAULT_DAY,
  saturday: null,
};

function StaffScheduleRowEditor({ workspaceId, staff, canEdit }: { workspaceId: string; staff: StaffScheduleRow; canEdit: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [timezone, setTimezone] = useState(staff.timezone ?? "");
  const [customHours, setCustomHours] = useState<BusinessHours | null>(staff.hours);
  const [saving, setSaving] = useState(false);

  async function saveTimezone(value: string) {
    setTimezone(value);
    const { error } = await supabase.from("user_profiles").update({ timezone: value || null }).eq("id", staff.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function toggleCustomHours(enabled: boolean) {
    if (!enabled) {
      setCustomHours(null);
      const { error } = await supabase.from("staff_business_hours").delete().eq("workspace_id", workspaceId).eq("user_id", staff.id);
      if (error) {
        toast.show(error.message, "error");
        return;
      }
      router.refresh();
      return;
    }
    const initial = customHours ?? BLANK_HOURS;
    setCustomHours(initial);
    await saveHours(initial);
  }

  async function saveHours(hours: BusinessHours) {
    setSaving(true);
    const { error } = await supabase
      .from("staff_business_hours")
      .upsert({ user_id: staff.id, workspace_id: workspaceId, hours }, { onConflict: "workspace_id,user_id" });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  function updateDay(day: keyof BusinessHours, patch: Partial<NonNullable<DayHours>> | null) {
    setCustomHours((prev) => {
      const base = prev ?? BLANK_HOURS;
      const next = { ...base, [day]: patch === null ? null : { ...(base[day] ?? DEFAULT_DAY), ...patch } };
      saveHours(next);
      return next;
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
        Timezone
        <select value={timezone} onChange={(e) => saveTimezone(e.target.value)} disabled={!canEdit} className={inputClass}>
          <option value="">Use the workspace default</option>
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs font-medium text-muted">
        <input
          type="checkbox"
          checked={Boolean(customHours)}
          disabled={!canEdit}
          onChange={(e) => toggleCustomHours(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Set working hours just for this person (instead of the workspace default)
      </label>

      {customHours && (
        <div className="space-y-1.5 pl-1">
          {WEEKDAYS.map((day) => {
            const open = customHours[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex w-24 items-center gap-1.5 font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={Boolean(open)}
                    disabled={!canEdit}
                    onChange={(e) => updateDay(day, e.target.checked ? {} : null)}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  {DAY_LABELS[day]}
                </label>
                {open ? (
                  <div className="flex items-center gap-1.5 text-muted">
                    <input
                      type="time"
                      value={open.start}
                      disabled={!canEdit}
                      onChange={(e) => updateDay(day, { start: e.target.value })}
                      className={`${inputClass} py-1`}
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={open.end}
                      disabled={!canEdit}
                      onChange={(e) => updateDay(day, { end: e.target.value })}
                      className={`${inputClass} py-1`}
                    />
                  </div>
                ) : (
                  <span className="text-muted">Off</span>
                )}
              </div>
            );
          })}
          {saving && <p className="text-[11px] text-muted">Saving...</p>}
        </div>
      )}
    </div>
  );
}

export function StaffScheduleManager({
  workspaceId,
  currentUserId,
  staff,
  canManageOthers,
}: {
  workspaceId: string;
  currentUserId: string | null;
  staff: StaffScheduleRow[];
  canManageOthers: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(currentUserId);

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft">
      <div className="border-b border-border p-4">
        <p className="text-sm font-medium text-ink">Staff timezone &amp; hours</p>
        <p className="mt-0.5 text-xs text-muted">
          Only needed for a booking link scoped to one specific person -- without a personal timezone or hours set, they use the
          workspace default.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {staff.map((s) => {
          const canEdit = canManageOthers || s.id === currentUserId;
          const isOpen = openId === s.id;
          return (
            <li key={s.id} className="p-4">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : s.id)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-ink"
              >
                <span>
                  {s.label}
                  {s.id === currentUserId ? " (you)" : ""}
                </span>
                {isOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
              </button>
              {isOpen && (
                <div className="mt-3">
                  <StaffScheduleRowEditor workspaceId={workspaceId} staff={s} canEdit={canEdit} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
