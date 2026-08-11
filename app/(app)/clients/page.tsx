import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { NewClientButton } from "./NewClientButton";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const CONTACT_TABS = [
  { key: "clients", label: "Clients" },
  { key: "leads", label: "Leads" },
] as const;
type ContactTab = (typeof CONTACT_TABS)[number]["key"];

const CLIENT_LIFECYCLE_STATUSES = ["active", "inactive", "archived"];
const LEAD_LIFECYCLE_STATUSES = ["lead", "consult_scheduled", "proposal_sent"];

const CLIENT_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];
const LEAD_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "lead", label: "Lead" },
  { value: "consult_scheduled", label: "Consult Scheduled" },
  { value: "proposal_sent", label: "Proposal Sent" },
];

function statusBadgeClass(status: string) {
  if (status === "lead") return "bg-warning/10 text-warning";
  if (status === "active") return "bg-accentSoft text-accent";
  return "bg-surfaceMuted text-muted";
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
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
  ]);

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
        {!clients || clients.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              message={
                status
                  ? `No ${tab} with status "${statusFilters.find((f) => f.value === status)?.label}".`
                  : tab === "leads"
                    ? "No leads yet."
                    : "No clients yet. Add your first client to get started."
              }
              action={
                !status && canCreate ? (
                  <NewClientButton workspaceId={workspace.id} workspaceName={workspace.name} services={services ?? []} />
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-surfaceMuted">
                    <td className="px-5 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium text-accent hover:underline">
                        {clientDisplayName(c)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 capitalize text-slate">{c.client_type}</td>
                    <td className="px-5 py-3 text-slate">{c.primary_email ?? "--"}</td>
                    <td className="px-5 py-3 text-slate">{c.primary_phone ?? "--"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(c.lifecycle_status)}`}>
                        {c.lifecycle_status === "lead" ? "Lead" : c.lifecycle_status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} pageSize={PAGE_SIZE} total={count ?? clients.length} basePath="/clients" extraQuery={extraQuery} />
          </div>
        )}
      </div>
    </>
  );
}
