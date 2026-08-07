import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { StageEditor } from "@/components/settings/StageEditor";

export const dynamic = "force-dynamic";

export default async function ServiceStagesPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: service } = await supabase
    .from("services")
    .select("id, name, workspace_id, process_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!service) notFound();

  const isSystemDefault = !service.workspace_id;

  const [{ data: canEdit }, { data: process }] = await Promise.all([
    isSystemDefault ? Promise.resolve({ data: false }) : supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
    service.process_id
      ? supabase.from("processes").select("id, name, workspace_id").eq("id", service.process_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [{ data: stages }, { data: tasks }, { data: stageCounts }] = await Promise.all([
    process
      ? supabase.from("process_stages").select("*").eq("process_id", process.id).order("display_order")
      : Promise.resolve({ data: [] as never[] }),
    process
      ? supabase
          .from("process_tasks")
          .select("*, process_stages!inner(process_id)")
          .eq("process_stages.process_id", process.id)
          .order("display_order")
      : Promise.resolve({ data: [] as never[] }),
    process
      ? supabase.from("engagements").select("current_stage").eq("workflow_id", process.id).not("current_stage", "is", null)
      : Promise.resolve({ data: [] as { current_stage: string }[] }),
  ]);

  const engagementCountsByStage = new Map<string, number>();
  for (const row of stageCounts ?? []) {
    const key = (row as { current_stage: string }).current_stage;
    engagementCountsByStage.set(key, (engagementCountsByStage.get(key) ?? 0) + 1);
  }

  return (
    <div className="max-w-3xl">
      <Link href="/settings/service-packages" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={13} /> Back to Service Packages
      </Link>
      <h2 className="text-base font-semibold text-ink">{service.name}</h2>
      <p className="mt-1 text-sm text-muted">
        Stages and tasks define this service&apos;s workflow. Changes here are global -- they apply to every engagement using this
        service, not just one client&apos;s.
      </p>

      <div className="mt-6">
        <StageEditor
          serviceId={service.id}
          isSystemDefault={isSystemDefault}
          canEdit={Boolean(canEdit)}
          process={process ?? null}
          stages={stages ?? []}
          tasks={(tasks ?? []) as never}
          engagementCountsByStage={Object.fromEntries(engagementCountsByStage)}
        />
      </div>
    </div>
  );
}
