import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { DataTable } from "@/components/ui/DataTable";
import { NewClientButton } from "../clients/NewClientButton";
import { TagFilterControl } from "../clients/TagFilterControl";
import { CLIENT_COLUMNS, type ClientRow } from "../clients/_shared";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const LEAD_LIFECYCLE_STATUSES = ["lead", "lost"];

const LEAD_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "lost", label: "Lost" },
];

export default async function LeadsPage({ searchParams }: { searchParams: { page?: string; status?: string; tag?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const status = searchParams.status && LEAD_STATUS_FILTERS.some((f) => f.value === searchParams.status) ? searchParams.status : "";

  const page = Math.max(Number(searchParams.page) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const tag = searchParams.tag?.trim() || "";

  let clientsQuery = supabase
    .from("clients")
    .select("id, client_type, first_name, last_name, business_name, primary_email, primary_phone, lifecycle_status, tags", {
      count: "exact",
    })
    .eq("workspace_id", workspace.id)
    .is("merged_into_client_id", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  clientsQuery = clientsQuery.in("lifecycle_status", status ? [status] : LEAD_LIFECYCLE_STATUSES);
  if (tag) clientsQuery = clientsQuery.contains("tags", [tag]);

  const [{ data: clients, count }, { data: services }, { data: serviceCategoriesRaw }, { data: canCreate }, { data: workspaceTags }] = await Promise.all([
    clientsQuery,
    supabase
      .from("services")
      .select("id, name, service_category_id, service_categories(slug)")
      .eq("workspace_id", workspace.id)
      .eq("status", "published")
      .order("display_order"),
    supabase
      .from("service_categories")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
    supabase.rpc("get_workspace_tags", { p_workspace_id: workspace.id }),
  ]);

  // Same category -> service grouping shape the public organizer's own
  // "what do you need help with" contact step uses (get_public_service_options),
  // so staff pick from the exact same choices leads see on their side.
  const serviceCategories = (serviceCategoriesRaw ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    services: (services ?? []).filter((s) => s.service_category_id === c.id).map((s) => ({ id: s.id, name: s.name })),
  })).filter((c) => c.services.length > 0);

  const clientIds = (clients ?? []).map((c) => c.id);
  const [{ data: interests }, { data: activeRuns }] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from("client_service_interests")
          .select("client_id, services(name)")
          .in("client_id", clientIds)
      : Promise.resolve({ data: [] as { client_id: string; services: { name: string } | null }[] }),
    clientIds.length > 0
      ? supabase
          .from("pipeline_runs")
          .select("entity_id, pipeline_stages!pipeline_runs_current_stage_fkey(stage_name)")
          .eq("entity_type", "client")
          .in("entity_id", clientIds)
          .eq("status", "Active")
      : Promise.resolve({ data: [] as { entity_id: string; pipeline_stages: { stage_name: string } | null }[] }),
  ]);

  // Leads can express interest in more than one service at once (e.g.
  // Bookkeeping + Payroll), so this shows every distinct one, not just
  // whichever was recorded most recently.
  const requestedServicesByClient = new Map<string, string[]>();
  for (const interest of interests ?? []) {
    const serviceName = (interest.services as unknown as { name?: string } | null)?.name;
    if (!serviceName) continue;
    const list = requestedServicesByClient.get(interest.client_id) ?? [];
    if (!list.includes(serviceName)) list.push(serviceName);
    requestedServicesByClient.set(interest.client_id, list);
  }
  const requestedServiceLabelByClient = new Map<string, string>();
  for (const [clientId, names] of requestedServicesByClient) {
    requestedServiceLabelByClient.set(clientId, names.join(", "));
  }
  // A lead can have simultaneous active runs in different pipelines (e.g.
  // Tax + Bookkeeping at once), so this shows every stage they're currently
  // on, not just whichever run happens to be returned last.
  const stageNamesByClient = new Map<string, string[]>();
  for (const run of activeRuns ?? []) {
    const stageName = (run.pipeline_stages as unknown as { stage_name?: string } | null)?.stage_name;
    if (!stageName) continue;
    const list = stageNamesByClient.get(run.entity_id) ?? [];
    if (!list.includes(stageName)) list.push(stageName);
    stageNamesByClient.set(run.entity_id, list);
  }
  const clientRows: ClientRow[] = (clients ?? []).map((c) => ({
    ...c,
    requestedService: requestedServiceLabelByClient.get(c.id) ?? null,
    stageLabel: c.lifecycle_status === "lead" ? (stageNamesByClient.get(c.id)?.join(", ") ?? null) : null,
  }));

  const extraQuery = [status ? `status=${status}` : "", tag ? `tag=${encodeURIComponent(tag)}` : ""].filter(Boolean).join("&");
  const statusQuery = tag ? `&tag=${encodeURIComponent(tag)}` : "";
  const tagQueryBase = `/leads${status ? `?status=${status}` : ""}`;

  return (
    <>
      <PageHeader
        title="Leads"
        description="Prospects who haven't engaged yet."
        actions={
          canCreate ? (
            <NewClientButton workspaceId={workspace.id} workspaceName={workspace.name} serviceCategories={serviceCategories} />
          ) : null
        }
      />
      <div className="flex-1 px-8 py-6">
        <p className="mb-3 text-xs text-muted">
          <Link href="/pipelines" className="font-medium text-accent hover:underline">
            View leads by stage in Pipelines →
          </Link>
        </p>

        <div className="mb-2 flex flex-wrap gap-2">
          {LEAD_STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `/leads?status=${f.value}${statusQuery}` : `/leads${statusQuery}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                status === f.value ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {(workspaceTags ?? []).length > 0 && (
          <div className="mb-4">
            <TagFilterControl tags={workspaceTags ?? []} activeTag={tag} baseHref={tagQueryBase} />
          </div>
        )}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          <DataTable
            columns={CLIENT_COLUMNS}
            rows={clientRows}
            emptyMessage={
              status
                ? `No leads with status "${LEAD_STATUS_FILTERS.find((f) => f.value === status)?.label}".`
                : "No leads yet."
            }
            emptyAction={
              !status && canCreate ? (
                <NewClientButton workspaceId={workspace.id} workspaceName={workspace.name} serviceCategories={serviceCategories} />
              ) : undefined
            }
          />
          {clients && clients.length > 0 && (
            <Pager page={page} pageSize={PAGE_SIZE} total={count ?? clients.length} basePath="/leads" extraQuery={extraQuery} />
          )}
        </div>
      </div>
    </>
  );
}
