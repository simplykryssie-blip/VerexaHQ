import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { BusinessHoursForm } from "@/components/settings/BusinessHoursForm";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SLOT_MINUTES, type BusinessHours } from "@/lib/businessHours";

export const dynamic = 'force-dynamic';

const BOOKING_KEYS = new Set(["business_hours", "booking_slot_minutes"]);

export default async function PreferencesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: settings } = await supabase
    .from("system_settings")
    .select("key, value, updated_at")
    .eq("workspace_id", workspace.id)
    .order("key");

  const businessHours = (settings?.find((s) => s.key === "business_hours")?.value as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  const slotMinutes = (settings?.find((s) => s.key === "booking_slot_minutes")?.value as number | undefined) ?? DEFAULT_SLOT_MINUTES;
  const otherSettings = (settings ?? []).filter((s) => !BOOKING_KEYS.has(s.key));

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={SlidersHorizontal}
        title="Workspace Preferences"
        description="Free-form workspace settings (business hours, notification defaults, engagement terms, etc.)."
      />

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink">Booking availability</h3>
        <div className="mt-2">
          <BusinessHoursForm workspaceId={workspace.id} initialHours={businessHours} initialSlotMinutes={slotMinutes} />
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-ink">Other preferences</h3>
        <div className="mt-2 rounded-xl border border-border bg-surface">
          {otherSettings.length === 0 ? (
            <EmptyState icon={SlidersHorizontal} message="No other workspace preferences have been set yet." />
          ) : (
            <ul className="divide-y divide-border">
              {otherSettings.map((s) => (
                <li key={s.key} className="px-5 py-3 text-sm">
                  <p className="font-medium text-slate">{s.key}</p>
                  <pre className="mt-1 overflow-x-auto rounded bg-surfaceMuted p-2 text-xs text-muted">
                    {JSON.stringify(s.value, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
