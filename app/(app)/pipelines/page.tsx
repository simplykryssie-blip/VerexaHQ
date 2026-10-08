import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { clientLabel } from "@/lib/documentEntityLabels";
import { ENGAGEMENT_STATUS_TONE } from "@/lib/engagementStatus";
import { PipelineKanbanClient, type KanbanCard, type KanbanStage } from "@/components/pipelines/PipelineKanbanClient";

export const dynamic = "force-dynamic";

// Caps how many active runs a single board loads -- same safety cap the
// Engagements board view uses (BOARD_CAP in app/(app)/engagements/page.tsx)
// for the same reason: a Kanban column is meant to be scanned, not paginated.
const RUN_CAP = 500;

type ClientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  client_type: string;
  tags: string[] | null;
};

type EngagementRow = {
  id: string;
  engagement_number: string | null;
  status: string;
  client_id: string;
  clients: { first_name: string | null; last_name: string | null; business_name: string | null; client_type: string } | null;
};

export default async function PipelinesPage({ searchParams }: { searchParams: { process?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: processes }, { data: canManagePipelines }, { data: canMoveClients }, { data: canMoveEngagements }, { data: canCreateClients }] =
    await Promise.all([
      supabase.from("processes").select("id, name, status").eq("workspace_id", workspace.id).order("name"),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "pipelines.manage" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.edit" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.manage" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
    ]);

  const pipelineOptions = (processes ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status }));
  const selectedProcessId =
    searchParams.process && pipelineOptions.some((p) => p.id === searchParams.process) ? searchParams.process : (pipelineOptions[0]?.id ?? null);

  let stages: KanbanStage[] = [];
  const cards: KanbanCard[] = [];

  if (selectedProcessId) {
    const [{ data: stageRows }, { data: runs }] = await Promise.all([
      supabase.from("process_stages").select("id, name, display_order").eq("process_id", selectedProcessId).order("display_order"),
      // entity_id is polymorphic (client or engagement), so there's no FK for
      // PostgREST to embed clients(...)/engagements(...) through -- fetch
      // runs first, then resolve each entity type separately and join in JS,
      // the same two-step pattern already used by getClientWorkspaceData.ts
      // and app/(app)/pipelines/[id]/page.tsx.
      supabase
        .from("pipeline_runs")
        .select("id, entity_type, entity_id, pipeline_stages!pipeline_runs_current_stage_fkey(process_stage_id)")
        .eq("process_id", selectedProcessId)
        .eq("workspace_id", workspace.id)
        .eq("status", "Active")
        .not("current_stage_id", "is", null)
        .limit(RUN_CAP),
    ]);
    stages = stageRows ?? [];

    const clientRunIds = (runs ?? []).filter((r) => r.entity_type === "client").map((r) => r.entity_id);
    const engagementRunIds = (runs ?? []).filter((r) => r.entity_type === "engagement").map((r) => r.entity_id);

    const [{ data: clientsData }, { data: engagementsData }] = await Promise.all([
      clientRunIds.length > 0
        ? supabase.from("clients").select("id, first_name, last_name, business_name, client_type, tags").in("id", clientRunIds)
        : Promise.resolve({ data: [] as ClientRow[] }),
      engagementRunIds.length > 0
        ? supabase
            .from("engagements")
            .select("id, engagement_number, status, client_id, clients(first_name, last_name, business_name, client_type)")
            .in("id", engagementRunIds)
        : Promise.resolve({ data: [] as EngagementRow[] }),
    ]);

    const clientsById = new Map((clientsData ?? []).map((c) => [c.id, c as ClientRow]));
    const engagementsById = new Map((engagementsData ?? []).map((e) => [e.id, e as unknown as EngagementRow]));

    for (const run of runs ?? []) {
      const processStageId = (run.pipeline_stages as unknown as { process_stage_id: string | null } | null)?.process_stage_id;
      if (!processStageId) continue;

      if (run.entity_type === "client") {
        const c = clientsById.get(run.entity_id);
        if (!c) continue;
        cards.push({
          runId: run.id,
          entityType: "client",
          entityId: c.id,
          processStageId,
          title: clientLabel(c),
          subtitle: (c.tags ?? []).join(", ") || null,
          badge: null,
          href: `/clients/${c.id}`,
        });
      } else if (run.entity_type === "engagement") {
        const e = engagementsById.get(run.entity_id);
        if (!e) continue;
        cards.push({
          runId: run.id,
          entityType: "engagement",
          entityId: e.id,
          processStageId,
          title: e.engagement_number ?? "Engagement",
          subtitle: clientLabel(e.clients),
          badge: { label: e.status, tone: ENGAGEMENT_STATUS_TONE[e.status] ?? "neutral" },
          href: `/clients/${e.client_id}`,
        });
      }
    }
  }

  return (
    <PipelineKanbanClient
      pipelines={pipelineOptions}
      selectedProcessId={selectedProcessId}
      stages={stages}
      cards={cards}
      canManagePipelines={Boolean(canManagePipelines)}
      canMoveClients={Boolean(canMoveClients)}
      canMoveEngagements={Boolean(canMoveEngagements)}
      canCreateClients={Boolean(canCreateClients)}
      canCreateEngagements={Boolean(canMoveEngagements)}
    />
  );
}
