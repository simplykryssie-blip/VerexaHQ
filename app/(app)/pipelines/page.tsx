import Link from "next/link";
import { GitBranch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspace.id}`;

  const { data: services } = await supabase
    .from("services")
    .select("id, name, workspace_id, process_id, service_categories(name)")
    .or(orFilter)
    .order("name");

  const processIds = (services ?? []).map((s) => s.process_id).filter((id): id is string => Boolean(id));
  const { data: stageCounts } =
    processIds.length > 0
      ? await supabase.from("process_stages").select("process_id").in("process_id", processIds)
      : { data: [] as { process_id: string }[] };

  const countByProcess = new Map<string, number>();
  for (const row of stageCounts ?? []) {
    countByProcess.set(row.process_id, (countByProcess.get(row.process_id) ?? 0) + 1);
  }

  return (
    <div className="max-w-4xl">
      <SettingsSectionHeader
        icon={GitBranch}
        title="Pipelines"
        description="The ordered stages each service's engagements move through, with the right form or letter attached at the step that needs it. Every pipeline belongs to one service."
      />

      <div className="mt-6">
        {!services || services.length === 0 ? (
          <EmptyState message="No services yet -- add one under Settings > Services first, then build its pipeline here." />
        ) : (
          <div className="space-y-2">
            {services.map((s) => {
              const stageCount = s.process_id ? countByProcess.get(s.process_id) ?? 0 : 0;
              return (
                <Link
                  key={s.id}
                  href={`/pipelines/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-accent hover:shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{s.name}</p>
                    <p className="text-xs text-muted">{(s.service_categories as unknown as { name?: string } | null)?.name ?? "Uncategorized"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surfaceMuted px-2.5 py-1 text-xs font-medium text-muted">
                    {stageCount > 0 ? `${stageCount} stage${stageCount === 1 ? "" : "s"}` : "No pipeline yet"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
