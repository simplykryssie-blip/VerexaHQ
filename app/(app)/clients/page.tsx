import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { NewClientButton } from "./NewClientButton";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const CONTACT_TABS = [
  { key: "clients", label: "Clients" },
  { key: "leads", label: "Leads" },
] as const;
type ContactTab = (typeof CONTACT_TABS)[number]["key"];

const CLIENT_LIFECYCLE_STATUSES = ["active", "inactive", "archived"];

const CLIENT_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

function statusTone(status: string): BadgeTone {
  if (status === "lost") return "danger";
  if (status === "active") return "success";
  if (status === "archived") return "neutral";
  return "warning";
}

function clientDisplayName(c: {
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
}) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

type ClientRow = {
  id: string;
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  lifecycle_status: string;
  tags: string[] | null;
  requestedService?: string | null;
  stageLabel?: string | null;
};

const CLIENT_COLUMNS: DataTableColumn<ClientRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (c) => (
      <div>
        <Link href={`/clients/${c.id}`} className="font-medium text-accent hover:underline">
          {clientDisplayName(c)}
        </Link>
        {c.requestedService && <p className="text-xs text-muted">{c.requestedService}</p>}
      </div>
    ),
  },
  { key: "type", header: "Type", render: (c) => <span className="capitalize text-slate">{c.client_type}</span> },
  { key: "email", header: "Email", render: (c) => <span className="text-slate">{c.primary_email ?? "--"}</span> },
  { key: "phone", header: "Phone", render: (c) => <span className="text-slate">{c.primary_phone ?? "--"}</span> },
  {
    key: "status",
    header: "Status",
    render: (c) => (
      <Badge tone={statusTone(c.lifecycle_status)} className="capitalize">
        {c.stageLabel ?? c.lifecycle_status.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    key: "tags",
    header: "Tags",
    render: (c) =>
      c.tags && c.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <span key={t} className="inline-block rounded-full bg-accentSoft px-2 py-0.5 text-xs font-medium text-accent">
              {t}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-muted">--</span>
      ),
  },
];

export default async function ClientsPage({ searchParams }: { searchParams: { page?: string; status?: string; tab?: string; tag?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const tab: ContactTab = searchParams.tab === "leads" ? "leads" : "clients";
  const supabase = createClient();
  const isLeadsTab = tab === "leads";

  // Leads move through a real Pipeline (lead_pipeline_runs/lead_pipeline_stages)
  // -- the same system "Move the lead to a pipeline stage" and "A lead enters
  // a pipeline stage" already use -- rather than the old flat, uncustomizable
  // lead_stages list. Which pipeline is "the" one for new leads is a
  // workspace setting (Pipelines page), so with none set the Leads tab just
  // shows All/Lost.
  let stageFilters: { value: string; label: string }[] = [];
  let defaultLeadProcessId: string | null = null;
  if (isLeadsTab) {
    const { data: workspaceRow } = await supabase.from("workspaces").select("default_lead_process_id").eq("id", workspace.id).maybeSingle();
    defaultLeadProcessId = workspaceRow?.default_lead_process_id ?? null;
    if (defaultLeadProcessId) {
      const { data: stages } = await supabase
        .from("process_stages")
        .select("id, name")
        .eq("process_id", defaultLeadProcessId)
        .order("display_order");
      stageFilters = (stages ?? []).map((s) => ({ value: s.id, label: s.name }));
    }
  }

  const lifecycleScope = isLeadsTab ? ["lead", "lost"] : CLIENT_LIFECYCLE_STATUSES;
  const statusFilters = isLeadsTab
    ? [{ value: "", label: "All" }, ...stageFilters, { value: "lost", label: "Lost" }]
    : CLIENT_STATUS_FILTERS;
  const isStageFilter = isLeadsTab && !!searchParams.status && searchParams.status !== "lost" && stageFilters.some((f) => f.value === searchParams.status);
  const status = searchParams.status && (isStageFilter || statusFilters.some((f) => f.value === searchParams.status)) ? searchParams.status : "";

  // A stage filter isn't a lifecycle_status -- resolve which clients are
  // currently sitting on that pipeline stage first, then filter by id.
  let stageClientIds: string[] | null = null;
  if (isStageFilter) {
    const { data: activeStages } = await supabase
      .from("lead_pipeline_stages")
      .select("lead_pipeline_run_id")
      .eq("process_stage_id", status)
      .eq("status", "In Progress");
    const runIds = (activeStages ?? []).map((s) => s.lead_pipeline_run_id);
    const { data: runs } =
      runIds.length > 0 ? await supabase.from("lead_pipeline_runs").select("client_id").in("id", runIds) : { data: [] as { client_id: string }[] };
    stageClientIds = (runs ?? []).map((r) => r.client_id);
  }

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
  if (isStageFilter) {
    clientsQuery = clientsQuery.eq("lifecycle_status", "lead").in("id", stageClientIds && stageClientIds.length > 0 ? stageClientIds : ["-"]);
  } else {
    clientsQuery = clientsQuery.in("lifecycle_status", status ? [status] : lifecycleScope);
  }
  if (tag) clientsQuery = clientsQuery.contains("tags", [tag]);

  const [{ data: clients, count }, { data: services }, { data: canCreate }, { data: workspaceTags }] = await Promise.all([
    clientsQuery,
    supabase
      .from("services")
      .select("id, name, service_categories(slug)")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
    supabase.rpc("get_workspace_tags", { p_workspace_id: workspace.id }),
  ]);

  const clientIds = (clients ?? []).map((c) => c.id);
  const [{ data: interests }, { data: activeRuns }] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from("client_service_interests")
          .select("client_id, created_at, service_categories(name), services(name)")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    isLeadsTab && clientIds.length > 0
      ? supabase
          .from("lead_pipeline_runs")
          .select("client_id, lead_pipeline_stages!lead_pipeline_runs_current_stage_fkey(stage_name)")
          .in("client_id", clientIds)
          .eq("status", "Active")
      : Promise.resolve({ data: [] as { client_id: string; lead_pipeline_stages: { stage_name: string } | null }[] }),
  ]);

  const latestInterestByClient = new Map<string, string>();
  for (const interest of interests ?? []) {
    if (latestInterestByClient.has(interest.client_id)) continue;
    const categoryName = (interest.service_categories as unknown as { name?: string } | null)?.name;
    const serviceName = (interest.services as unknown as { name?: string } | null)?.name;
    const label = [categoryName, serviceName].filter(Boolean).join(" -- ");
    if (label) latestInterestByClient.set(interest.client_id, label);
  }
  const stageNameByClient = new Map<string, string>();
  for (const run of activeRuns ?? []) {
    const stageName = (run.lead_pipeline_stages as unknown as { stage_name?: string } | null)?.stage_name;
    if (stageName) stageNameByClient.set(run.client_id, stageName);
  }
  const clientRows: ClientRow[] = (clients ?? []).map((c) => ({
    ...c,
    requestedService: latestInterestByClient.get(c.id) ?? null,
    stageLabel: c.lifecycle_status === "lead" ? (stageNameByClient.get(c.id) ?? null) : null,
  }));

  const extraQuery = [tab !== "clients" ? `tab=${tab}` : "", status ? `status=${status}` : "", tag ? `tag=${encodeURIComponent(tag)}` : ""]
    .filter(Boolean)
    .join("&");
  const statusQuery = tag ? `&tag=${encodeURIComponent(tag)}` : "";
  const tagQueryBase = `/clients?tab=${tab}${status ? `&status=${status}` : ""}`;

  return (
    <>
      <PageHeader
        title="Contacts"
        description={tab === "leads" ? "Prospects who haven't engaged yet." : "Every client in your workspace."}
        actions={
          canCreate ? (
            <NewClientButton workspaceId={workspace.id} workspaceName={workspace.name} services={services ?? []} />
          ) : null
        }
      />
      <div className="flex-1 px-8 py-6">
        <nav className="mb-4 flex gap-1 border-b border-border">
          {CONTACT_TABS.map((t) => (
            <Link
              key={t.key}
              href={`/clients?tab=${t.key}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {isLeadsTab && !defaultLeadProcessId && (
          <p className="mb-3 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
            No pipeline is set for new leads yet --{" "}
            <Link href="/pipelines" className="font-medium text-accent hover:underline">
              pick one in Pipelines
            </Link>{" "}
            to track leads through stages here.
          </p>
        )}

        <div className="mb-2 flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `/clients?tab=${tab}&status=${f.value}${statusQuery}` : `/clients?tab=${tab}${statusQuery}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                status === f.value ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {(workspaceTags ?? []).length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Tag:</span>
            <Link
              href={tagQueryBase}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                !tag ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
              }`}
            >
              All
            </Link>
            {(workspaceTags ?? []).map((t) => (
              <Link
                key={t}
                href={`${tagQueryBase}&tag=${encodeURIComponent(t)}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  tag === t ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <DataTable
            columns={CLIENT_COLUMNS}
            rows={clientRows}
            emptyMessage={
              status
                ? `No ${tab} with status "${statusFilters.find((f) => f.value === status)?.label}".`
                : tab === "leads"
                  ? "No leads yet."
                  : "No clients yet. Add your first client to get started."
            }
            emptyAction={
              !status && canCreate ? (
                <NewClientButton workspaceId={workspace.id} workspaceName={workspace.name} services={services ?? []} />
              ) : undefined
            }
          />
          {clients && clients.length > 0 && (
            <Pager page={page} pageSize={PAGE_SIZE} total={count ?? clients.length} basePath="/clients" extraQuery={extraQuery} />
          )}
        </div>
      </div>
    </>
  );
}
