import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: settings } = await supabase
    .from("system_settings")
    .select("key, value, updated_at")
    .eq("workspace_id", workspace.id)
    .order("key");

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={SlidersHorizontal}
        title="Workspace Preferences"
        description="Free-form workspace settings (business hours, notification defaults, engagement terms, etc.)."
      />

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {!settings || settings.length === 0 ? (
          <EmptyState icon={SlidersHorizontal} message="No workspace preferences have been set yet." />
        ) : (
          <ul className="divide-y divide-border">
            {settings.map((s) => (
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
  );
}
