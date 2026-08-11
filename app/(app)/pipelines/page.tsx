import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { clientLabel } from "@/lib/documentEntityLabels";
import { ServiceBoard, type ServiceOption, type StageColumn, type BoardCard } from "@/components/pipelines/ServiceBoard";

export const dynamic = "force-dynamic";

export default async function PipelinesPage({ searchParams }: { searchParams: { service?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspace.id}`;

  const { data: services } = await supabase
    .from("services")
    .select("id, name, process_id")
    .or(orFilter)
    .eq("status", "published")
    .not("process_id", "is", null)
    .order("name");

  const serviceOptions: ServiceOption[] = services ?? [];
  const selectedService = serviceOptions.find((s) => s.id === searchParams.service) ?? serviceOptions[0] ?? null;

  const [{ data: stages }, { data: engagements }] = await Promise.all([
    selectedService
      ? supabase
          .from("process_stages")
          .select("id, name, display_order")
          .eq("process_id", selectedService.process_id)
          .order("display_order")
      : Promise.resolve({ data: [] as { id: string; name: string; display_order: number }[] }),
    selectedService
      ? supabase
          .from("engagements")
          .select(
            "id, engagement_number, priority, due_date, client_id, clients(first_name, last_name, business_name, client_type), workflow_runs(id, current_stage_id, status)"
          )
          .eq("workspace_id", workspace.id)
          .eq("service_id", selectedService.id)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: null }),
  ]);

  const stageColumns: StageColumn[] = stages ?? [];

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

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Your whole book of business laid out by stage -- driven by each service's checklist, not manual dragging. Mark a stage complete to move a card forward."
      />
      <div className="flex-1 px-8 py-6">
        <ServiceBoard services={serviceOptions} selectedServiceId={selectedService?.id ?? null} stages={stageColumns} cards={boardCards} />
      </div>
    </>
  );
}
