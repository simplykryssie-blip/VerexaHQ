import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Flag } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { FeatureFlagToggle } from "@/components/settings/FeatureFlagToggle";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: flags }, { data: overrides }, { data: isAdmin }] = await Promise.all([
    supabase.from("feature_flags").select("id, key, name, description, module, is_core, default_enabled").order("module").order("name"),
    supabase.from("workspace_feature_flags").select("feature_flag_id, is_enabled").eq("workspace_id", workspace.id),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  const overrideByFlag = new Map((overrides ?? []).map((o) => [o.feature_flag_id, o.is_enabled]));
  const byModule = new Map<string, typeof flags>();
  for (const f of flags ?? []) {
    const list = byModule.get(f.module) ?? [];
    list.push(f);
    byModule.set(f.module, list);
  }

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={Flag}
        title="Feature Flags"
        description="Turn optional modules on or off for this workspace. Core features can't be disabled."
      />

      {!isAdmin && (
        <p className="mt-4 text-sm text-muted">Only workspace admins can change feature flags.</p>
      )}

      {(flags ?? []).length === 0 ? (
        <EmptyState icon={Flag} message="No feature flags found." />
      ) : (
        <div className="mt-6 space-y-6">
          {Array.from(byModule.entries()).map(([module, moduleFlags]) => (
            <div key={module} className="rounded-xl border border-border bg-surface">
              <h3 className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{module}</h3>
              <ul className="divide-y divide-border">
                {(moduleFlags ?? []).map((f) => {
                  const enabled = overrideByFlag.has(f.id) ? (overrideByFlag.get(f.id) as boolean) : f.default_enabled;
                  return (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {f.name} {f.is_core && <span className="ml-1.5 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">Core</span>}
                        </p>
                        {f.description && <p className="text-xs text-muted">{f.description}</p>}
                      </div>
                      <FeatureFlagToggle workspaceId={workspace.id} flagKey={f.key} enabled={enabled} disabled={f.is_core || !isAdmin} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
