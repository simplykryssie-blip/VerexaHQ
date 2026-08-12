import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { clientLabel } from "@/lib/documentEntityLabels";
import { ServiceDetailTabs } from "@/components/settings/ServiceDetailTabs";
import type { BoardCard } from "@/components/pipelines/ServiceBoard";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: service } = await supabase
    .from("services")
    .select("id, name, workspace_id, status, description, estimated_duration_minutes, is_bookable, is_portal_visible, service_category_id, organizer_template_id, process_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!service) notFound();

  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspace.id}`;

  const [{ data: categories }, { data: organizerTemplates }, { data: process }] = await Promise.all([
    supabase.from("service_categories").select("id, name").or(orFilter).order("name"),
    supabase.from("organizer_templates").select("id, name").or(orFilter).order("name"),
    service.process_id
      ? supabase.from("processes").select("id, name, workspace_id").eq("id", service.process_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [{ data: stages }, { data: stageCounts }, { data: engagements }] = await Promise.all([
    process
      ? supabase.from("process_stages").select("*").eq("process_id", process.id).order("display_order")
      : Promise.resolve({ data: [] as never[] }),
    process
      ? supabase.from("engagements").select("current_stage").eq("workflow_id", process.id).not("current_stage", "is", null)
      : Promise.resolve({ data: [] as { current_stage: string }[] }),
    process
      ? supabase
          .from("engagements")
          .select(
            "id, engagement_number, priority, due_date, client_id, clients(first_name, last_name, business_name, client_type), workflow_runs(id, current_stage_id, status)"
          )
          .eq("workspace_id", workspace.id)
          .eq("service_id", service.id)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: null }),
  ]);

  const engagementCountsByStage = new Map<string, number>();
  for (const row of stageCounts ?? []) {
    const key = (row as { current_stage: string }).current_stage;
    engagementCountsByStage.set(key, (engagementCountsByStage.get(key) ?? 0) + 1);
  }

  const currentStageIds = new Set<string>();
  for (const e of engagements ?? []) {
    const run = ((e.workflow_runs as unknown as { id: string; current_stage_id: string | null; status: string }[]) ?? []).find(
      (r) => r.status === "Active"
    );
    if (run?.current_stage_id) currentStageIds.add(run.current_stage_id);
  }

  const { data: workflowStages } =
    currentStageIds.size > 0
      ? await supabase.from("workflow_stages").select("id, process_stage_id, status").in("id", Array.from(currentStageIds))
      : { data: [] as { id: string; process_stage_id: string; status: string }[] };

  const stageById = new Map((workflowStages ?? []).map((s) => [s.id, s]));

  const boardCards: BoardCard[] = (engagements ?? []).flatMap((e) => {
    const run = ((e.workflow_runs as unknown as { id: string; current_stage_id: string | null; status: string }[]) ?? []).find(
      (r) => r.status === "Active"
    );
    const currentStage = run?.current_stage_id ? stageById.get(run.current_stage_id) : undefined;
    if (!currentStage) return [];
    return [
      {
        id: e.id,
        engagement_number: e.engagement_number,
        priority: e.priority,
        due_date: e.due_date,
        clientLabel: clientLabel(e.clients as never),
        clientHref: `/clients/${e.client_id}`,
        processStageId: currentStage.process_stage_id,
        workflowStageId: currentStage.id,
      },
    ];
  });

  const defaultTab = searchParams.tab === "board" ? "board" : "details";

  return (
    <div>
      <Link href="/settings/services" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={13} /> Back to Services
      </Link>
      <h2 className="mb-4 text-base font-semibold text-ink">{service.name}</h2>

      <ServiceDetailTabs
        service={service}
        workspaceId={workspace.id}
        categories={categories ?? []}
        organizerTemplates={organizerTemplates ?? []}
        hasPipeline={Boolean(process)}
        boardStages={stages ?? []}
        boardCards={boardCards}
        defaultTab={defaultTab}
      />
    </div>
  );
}
