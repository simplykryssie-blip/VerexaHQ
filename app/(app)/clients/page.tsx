import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { DataTable } from "@/components/ui/DataTable";
import { NewClientButton } from "./NewClientButton";
import { TagFilterControl } from "./TagFilterControl";
import { CLIENT_COLUMNS, type ClientRow } from "./clientListColumns";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

// Every lifecycle status in one combined list -- leads, lost leads, and
// active/inactive/archived clients all live together with no sub-tabs by
// status or type. Individual vs business is already visible via the Type
// column, so no separate filter for that either.
const ALL_LIFECYCLE_STATUSES = ["lead", "active", "inactive", "lost", "archived"];

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "lead", label: "Lead" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
];

export default async function ClientsPage({ searchParams }: { searchParams: { page?: string; status?: string; tag?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const status = searchParams.status && STATUS_FILTERS.some((f) => f.value === searchParams.status) ? searchParams.status : "";

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
  clientsQuery = clientsQuery.in("lifecycle_status", status ? [status] : ALL_LIFECYCLE_STATUSES);
  if (tag) clientsQuery = clientsQuery.contains("tags", [tag]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: clients, count }, { data: services }, { data: serviceCategoriesRaw }, { data: canCreate }, { data: workspaceTags }, { data: activeMembers }, { data: membership }] =
    await Promise.all([
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
      supabase.from("workspace_users").select("user_id").eq("workspace_id", workspace.id).eq("status", "active"),
      user
        ? supabase.from("workspace_users").select("is_owner").eq("workspace_id", workspace.id).eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const isOwner = Boolean(membership?.is_owner);
  // Only the owner ever sees the "assign to" picker (below), so whenever it
  // renders, the current viewer IS the account holder -- naming them
  // directly instead of a generic "Me" makes the default assignment
  // unambiguous.
  const { data: currentProfile } = user ? await supabase.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle() : { data: null };
  const accountHolderName = currentProfile?.display_name ?? "Me";
  // Excludes the current viewer -- the picker's own default option already
  // covers "assign to me" (see NewClientButton), so listing them again by
  // name here just duplicates that choice under two different labels.
  const staffUserIds = (activeMembers ?? []).map((m) => m.user_id).filter((id) => id !== user?.id);
  const { data: staffProfiles } = staffUserIds.length
    ? await supabase.from("user_profiles").select("id, display_name").in("id", staffUserIds)
    : { data: [] };
  const staffOptions = staffProfiles ?? [];

  // Same category -> service grouping shape the public organizer's own
  // "what do you need help with" contact step uses (get_public_service_options),
  // so staff pick from the exact same choices clients see on their side.
  const serviceCategories = (serviceCategoriesRaw ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    services: (services ?? []).filter((s) => s.service_category_id === c.id).map((s) => ({ id: s.id, name: s.name })),
  })).filter((c) => c.services.length > 0);

  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: interests } = clientIds.length > 0
    ? await supabase
        .from("client_service_interests")
        .select("client_id, services(name)")
        .in("client_id", clientIds)
    : { data: [] as { client_id: string; services: { name: string } | null }[] };

  // A client can express interest in more than one service at once (e.g.
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

  // Nothing else on this list tells staff a client submitted something --
  // the only way to notice was opening every client one at a time.
  const { data: submittedOrganizers } = clientIds.length > 0
    ? await supabase.from("organizer_responses").select("client_id").in("client_id", clientIds).eq("status", "submitted")
    : { data: [] as { client_id: string }[] };
  const clientsNeedingReview = new Set((submittedOrganizers ?? []).map((o) => o.client_id));

  const clientRows: ClientRow[] = (clients ?? []).map((c) => ({
    ...c,
    needsReview: clientsNeedingReview.has(c.id),
    requestedService: requestedServiceLabelByClient.get(c.id) ?? null,
  }));

  const extraQuery = [status ? `status=${status}` : "", tag ? `tag=${encodeURIComponent(tag)}` : ""].filter(Boolean).join("&");
  const statusQuery = tag ? `&tag=${encodeURIComponent(tag)}` : "";
  const tagQueryBase = `/clients${status ? `?status=${status}` : ""}`;

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Every client and lead in your workspace."
        actions={
          canCreate ? (
            <NewClientButton
              workspaceId={workspace.id}
              workspaceName={workspace.name}
              serviceCategories={serviceCategories}
              isOwner={isOwner}
              staffOptions={staffOptions}
              accountHolderName={accountHolderName}
            />
          ) : null
        }
      />
      <div className="flex-1 px-8 py-6">
        <div className="mb-2 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `/clients?status=${f.value}${statusQuery}` : `/clients${statusQuery}`}
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
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition hover:shadow-softHover">
          <DataTable
            columns={CLIENT_COLUMNS}
            rows={clientRows}
            emptyMessage={
              status
                ? `No clients with status "${STATUS_FILTERS.find((f) => f.value === status)?.label}".`
                : "No clients yet. Add your first client to get started."
            }
            emptyAction={
              !status && canCreate ? (
                <NewClientButton
              workspaceId={workspace.id}
              workspaceName={workspace.name}
              serviceCategories={serviceCategories}
              isOwner={isOwner}
              staffOptions={staffOptions}
              accountHolderName={accountHolderName}
            />
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
