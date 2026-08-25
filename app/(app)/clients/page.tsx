import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { NewClientButton } from "./NewClientButton";
import { TagFilterControl } from "./TagFilterControl";

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
  // lead_stages list. There's no single designated "default" pipeline for
  // leads; any pipeline with active leads shows them on its own page (each
  // stage card shows its leads, same shape as every other pipeline), so
  // this page just points at Pipelines rather than a specific one.
  const lifecycleScope = isLeadsTab ? ["lead", "lost"] : CLIENT_LIFECYCLE_STATUSES;
  const statusFilters = isLeadsTab ? [{ value: "", label: "All" }, { value: "lost", label: "Lost" }] : CLIENT_STATUS_FILTERS;
  const status = searchParams.status && statusFilters.some((f) => f.value === searchParams.status) ? searchParams.status : "";

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
  clientsQuery = clientsQuery.in("lifecycle_status", status ? [status] : lifecycleScope);
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
  // so staff pick from the exact same choices clients see on their side.
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
      : Promise.resolve({ data: [] as never[] }),
    isLeadsTab && clientIds.length > 0
      ? supabase
          .from("lead_pipeline_runs")
          .select("client_id, lead_pipeline_stages!lead_pipeline_runs_current_stage_fkey(stage_name)")
          .in("client_id", clientIds)
          .eq("status", "Active")
      : Promise.resolve({ data: [] as { client_id: string; lead_pipeline_stages: { stage_name: string } | null }[] }),
  ]);

  // Services are "basic" now and a lead can select more than one at once
  // (e.g. Bookkeeping + Payroll), so this shows every distinct one they've
  // expressed interest in, not just whichever was recorded most recently.
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
  // A client can have simultaneous active runs in different pipelines (e.g.
  // Tax + Bookkeeping at once), so this shows every stage they're currently
  // on, not just whichever run happens to be returned last.
  const stageNamesByClient = new Map<string, string[]>();
  for (const run of activeRuns ?? []) {
    const stageName = (run.lead_pipeline_stages as unknown as { stage_name?: string } | null)?.stage_name;
    if (!stageName) continue;
    const list = stageNamesByClient.get(run.client_id) ?? [];
    if (!list.includes(stageName)) list.push(stageName);
    stageNamesByClient.set(run.client_id, list);
  }
  const clientRows: ClientRow[] = (clients ?? []).map((c) => ({
    ...c,
    requestedService: requestedServiceLabelByClient.get(c.id) ?? null,
    stageLabel: c.lifecycle_status === "lead" ? (stageNamesByClient.get(c.id)?.join(", ") ?? null) : null,
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
            <NewClientButton workspaceId={workspace.id} workspaceName={workspace.name} serviceCategories={serviceCategories} />
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

        {isLeadsTab && (
          <p className="mb-3 text-xs text-muted">
            <Link href="/pipelines" className="font-medium text-accent hover:underline">
              View leads by stage in Pipelines →
            </Link>
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
                ? `No ${tab} with status "${statusFilters.find((f) => f.value === status)?.label}".`
                : tab === "leads"
                  ? "No leads yet."
                  : "No clients yet. Add your first client to get started."
            }
            emptyAction={
              !status && canCreate ? (
                <NewClientButton workspaceId={workspace.id} workspaceName={workspace.name} serviceCategories={serviceCategories} />
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
