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
const LEAD_LIFECYCLE_STATUSES = ["lead"];

const CLIENT_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];
const LEAD_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "lead", label: "Lead" },
];

function statusTone(status: string): BadgeTone {
  if (status === "lead") return "warning";
  if (status === "active") return "success";
  return "neutral";
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
  requestedService?: string | null;
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
        {c.lifecycle_status === "lead" ? "Lead" : c.lifecycle_status.replace("_", " ")}
      </Badge>
    ),
  },
];

export default async function ClientsPage({ searchParams }: { searchParams: { page?: string; status?: string; tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const tab: ContactTab = searchParams.tab === "leads" ? "leads" : "clients";
  const lifecycleScope = tab === "leads" ? LEAD_LIFECYCLE_STATUSES : CLIENT_LIFECYCLE_STATUSES;
  const statusFilters = tab === "leads" ? LEAD_STATUS_FILTERS : CLIENT_STATUS_FILTERS;
  const status = searchParams.status && lifecycleScope.includes(searchParams.status) ? searchParams.status : "";

  const page = Math.max(Number(searchParams.page) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createClient();
  const clientsQuery = supabase
    .from("clients")
    .select("id, client_type, first_name, last_name, business_name, primary_email, primary_phone, lifecycle_status", { count: "exact" })
    .eq("workspace_id", workspace.id)
    .is("merged_into_client_id", null)
    .in("lifecycle_status", status ? [status] : lifecycleScope)
    .order("created_at", { ascending: false })
    .range(from, to);

  const [{ data: clients, count }, { data: services }, { data: canCreate }] = await Promise.all([
    clientsQuery,
    supabase
      .from("services")
      .select("id, name, service_categories(slug)")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
  ]);

  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: interests } =
    clientIds.length > 0
      ? await supabase
          .from("client_service_interests")
          .select("client_id, created_at, service_categories(name), services(name)")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  const latestInterestByClient = new Map<string, string>();
  for (const interest of interests ?? []) {
    if (latestInterestByClient.has(interest.client_id)) continue;
    const categoryName = (interest.service_categories as unknown as { name?: string } | null)?.name;
    const serviceName = (interest.services as unknown as { name?: string } | null)?.name;
    const label = [categoryName, serviceName].filter(Boolean).join(" -- ");
    if (label) latestInterestByClient.set(interest.client_id, label);
  }
  const clientRows: ClientRow[] = (clients ?? []).map((c) => ({ ...c, requestedService: latestInterestByClient.get(c.id) ?? null }));

  const extraQuery = [tab !== "clients" ? `tab=${tab}` : "", status ? `status=${status}` : ""].filter(Boolean).join("&");

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

        <div className="mb-4 flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `/clients?tab=${tab}&status=${f.value}` : `/clients?tab=${tab}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                status === f.value ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
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
