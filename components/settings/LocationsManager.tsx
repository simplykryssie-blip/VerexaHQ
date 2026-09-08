"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TIMEZONE_OPTIONS } from "@/lib/timezoneOptions";
import { WEEKDAYS, DEFAULT_BUSINESS_HOURS, type BusinessHours, type DayHours } from "@/lib/businessHours";

const DAY_LABELS: Record<string, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

export type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  timezone: string | null;
  hours: BusinessHours;
  is_default: boolean;
};

const inputClass = "rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const DEFAULT_DAY: DayHours = { start: "09:00", end: "17:00" };

function LocationCard({ location, canManage }: { location: LocationRow; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address ?? "");
  const [timezone, setTimezone] = useState(location.timezone ?? "");
  const [hours, setHours] = useState<BusinessHours>(location.hours);
  const [saving, setSaving] = useState(false);

  async function save(patch: Partial<{ name: string; address: string | null; timezone: string | null; hours: BusinessHours }>) {
    setSaving(true);
    const { error } = await supabase.from("booking_locations").update(patch).eq("id", location.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  function updateDay(day: keyof BusinessHours, patch: Partial<NonNullable<DayHours>> | null) {
    setHours((prev) => {
      const next = { ...prev, [day]: patch === null ? null : { ...(prev[day] ?? DEFAULT_DAY), ...patch } };
      save({ hours: next });
      return next;
    });
  }

  async function setDefault() {
    const { error } = await supabase.from("booking_locations").update({ is_default: true }).eq("id", location.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete "${location.name}"? Any services assigned to it fall back to the workspace default hours.`)) return;
    const { error } = await supabase.from("booking_locations").delete().eq("id", location.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Location deleted", "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          {open ? <ChevronUp size={15} className="shrink-0 text-muted" /> : <ChevronDown size={15} className="shrink-0 text-muted" />}
          <span className="font-medium text-ink">{location.name}</span>
          {location.is_default && <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-semibold text-accent">Default</span>}
        </button>
        {canManage && (
          <button type="button" onClick={remove} className="shrink-0 rounded-lg p-1.5 text-muted hover:text-danger" aria-label="Delete location">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save({ name: name.trim() || location.name })} disabled={!canManage} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Address
            <input value={address} onChange={(e) => setAddress(e.target.value)} onBlur={() => save({ address: address.trim() || null })} disabled={!canManage} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Timezone
            <select value={timezone} onChange={(e) => { setTimezone(e.target.value); save({ timezone: e.target.value || null }); }} disabled={!canManage} className={`${inputClass} max-w-xs`}>
              <option value="">Use the workspace default</option>
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            {WEEKDAYS.map((day) => {
              const dayHours = hours[day];
              return (
                <div key={day} className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex w-20 items-center gap-1.5 font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={Boolean(dayHours)}
                      disabled={!canManage}
                      onChange={(e) => updateDay(day, e.target.checked ? {} : null)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    {DAY_LABELS[day]}
                  </label>
                  {dayHours ? (
                    <div className="flex items-center gap-1.5 text-muted">
                      <input type="time" value={dayHours.start} disabled={!canManage} onChange={(e) => updateDay(day, { start: e.target.value })} className={`${inputClass} py-1`} />
                      <span>to</span>
                      <input type="time" value={dayHours.end} disabled={!canManage} onChange={(e) => updateDay(day, { end: e.target.value })} className={`${inputClass} py-1`} />
                    </div>
                  ) : (
                    <span className="text-muted">Closed</span>
                  )}
                </div>
              );
            })}
          </div>

          {!location.is_default && canManage && (
            <button type="button" onClick={setDefault} className="text-xs font-medium text-accent hover:underline">
              Make this the default location
            </button>
          )}
          {saving && <p className="text-[11px] text-muted">Saving...</p>}
        </div>
      )}
    </div>
  );
}

export function LocationsManager({ workspaceId, locations, canManage }: { workspaceId: string; locations: LocationRow[]; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    const { error } = await supabase.from("booking_locations").insert({
      workspace_id: workspaceId,
      name: trimmed,
      hours: DEFAULT_BUSINESS_HOURS,
      is_default: locations.length === 0,
      display_order: locations.length,
    });
    setCreating(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewName("");
    toast.show("Location added", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {locations.length === 0 ? (
        <p className="text-sm text-muted">No locations yet -- every service uses the workspace-wide hours until you add one.</p>
      ) : (
        <div className="space-y-3">
          {locations.map((l) => (
            <LocationCard key={l.id} location={l} canManage={canManage} />
          ))}
        </div>
      )}
      {canManage && (
        <form onSubmit={addLocation} className="flex items-end gap-2 rounded-2xl border border-dashed border-border bg-surfaceMuted p-4">
          <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
            New location
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Downtown Office"
              className={`mt-1 w-full ${inputClass}`}
            />
          </label>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            <Plus size={13} /> {creating ? "Adding..." : "Add location"}
          </button>
        </form>
      )}
    </div>
  );
}
