import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { NewClientButton } from "./NewClientButton";
import { TagFilterControl } from "./TagFilterControl";
import { ContactsSearchBar } from "./ContactsSearchBar";
import { ContactsBulkTable } from "./ContactsBulkTable";
import { resolveAssignedStaff, type ClientRow } from "./clientListColumns";

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

// Mirrors clients_client_type_check exactly -- the Type column already
// shows this, this just makes it filterable too (Contacts Reconciliation
// Audit, Product Decision #12: "Account Type" was found to be a duplicate
// of this field, not a separate concept, so it gets no filter of its own).
const CLIENT_TYPE_FILTERS = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
  { value: "trust", label: "Trust" },
  { value: "estate", label: "Estate" },
  { value: "organization", label: "Organization" },
];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: {
    page?: string;
    status?: string;
    tag?: string;
    q?: string;
    service?: string;
    staff?: string;
    stage?: string;
    missingDocs?: string;
    balance?: string;
    clientType?: string;
    hasEmail?: string;
    hasPhone?: string;
  };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const status = searchParams.status && STATUS_FILTERS.some((f) => f.value === searchParams.status) ? searchParams.status : "";

  const page = Math.max(Number(searchParams.page) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;

  const tag = searchParams.tag?.trim() || "";
  const q = searchParams.q?.trim() || "";
  const serviceFilter = searchParams.service?.trim() || "";
  const staffFilter = searchParams.staff?.trim() || "";
  const stageFilter = searchParams.stage?.trim() || "";
  const missingDocuments = searchParams.missingDocs === "1";
  const outstandingBalance = searchParams.balance === "1";
  const clientType = CLIENT_TYPE_FILTERS.some((f) => f.value === searchParams.clientType) ? (searchParams.clientType as string) : "";
  // "1" = has one on file, "0" = missing -- anything else (unset) means the
  // filter isn't applied, matching search_clients' own null-means-ignore
  // pattern for p_has_email/p_has_phone.
  const hasEmail = searchParams.hasEmail === "1" ? true : searchParams.hasEmail === "0" ? false : undefined;
  const hasPhone = searchParams.hasPhone === "1" ? true : searchParams.hasPhone === "0" ? false : undefined;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: searchResults },
    { data: services },
    { data: serviceCategoriesRaw },
    { data: canCreate },
    { data: canEdit },
    { data: workspaceTags },
    { data: activeMembers },
    { data: membership },
    { data: pipelineStageRows },
  ] = await Promise.all([
    // Every filter this page offers (free text, service, assigned staff,
    // pipeline stage, missing documents, outstanding balance) lives on a
    // different table -- search_clients does the real joins server-side so
    // pagination stays correct against the filtered set.
    supabase.rpc("search_clients", {
      p_workspace_id: workspace.id,
      p_query: q || undefined,
      p_lifecycle_statuses: status ? [status] : ALL_LIFECYCLE_STATUSES,
      p_tag: tag || undefined,
      p_service_id: serviceFilter || undefined,
      p_assigned_staff_id: staffFilter || undefined,
      p_pipeline_stage_name: stageFilter || undefined,
      p_missing_documents: missingDocuments ? true : undefined,
      p_outstanding_balance: outstandingBalance ? true : undefined,
      p_client_type: clientType || undefined,
      p_has_email: hasEmail,
      p_has_phone: hasPhone,
      p_limit: PAGE_SIZE,
      p_offset: from,
    }),
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
    // Bulk status/assignment mutate existing contacts, not create new ones --
    // clients.edit is the same permission mark_client_lost and the
    // assignments page already require for exactly this kind of write.
    // Bulk tag/export stay on the existing clients.create-gated canManage
    // below, unchanged, since that's how they already shipped.
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.edit" }),
    supabase.rpc("get_workspace_tags", { p_workspace_id: workspace.id }),
    supabase.from("workspace_users").select("user_id").eq("workspace_id", workspace.id).eq("status", "active"),
    user
      ? supabase.from("workspace_users").select("is_owner").eq("workspace_id", workspace.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Distinct stage names across active pipelines in this workspace, for
    // the "Pipeline stage" filter -- stage_name is denormalized onto
    // pipeline_stages itself so no join to process_stages is needed.
    supabase
      .from("pipeline_stages")
      .select("stage_name, pipeline_runs!inner(workspace_id, status)")
      .eq("pipeline_runs.workspace_id", workspace.id)
      .eq("pipeline_runs.status", "Active"),
  ]);

  const clients = searchResults ?? [];
  const count = Number(clients[0]?.total_count ?? 0);

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

  const staffFilterOptions = user
    ? [{ value: user.id, label: accountHolderName }, ...staffOptions.map((s) => ({ value: s.id, label: s.display_name ?? "Unnamed" }))]
    : staffOptions.map((s) => ({ value: s.id, label: s.display_name ?? "Unnamed" }));
  const serviceFilterOptions = (services ?? []).map((s) => ({ value: s.id, label: s.name }));
  const pipelineStageOptions = Array.from(new Set((pipelineStageRows ?? []).map((r) => r.stage_name).filter((n): n is string => Boolean(n))))
    .sort()
    .map((name) => ({ value: name, label: name }));

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

  // search_clients' RETURNS TABLE never selects relationship_manager_id --
  // it's only used in the RPC's own WHERE clause for the existing "Assigned
  // to" filter -- so the Assigned Staff column needs its own scoped fetch
  // rather than a migration to the RPC's signature. Same enrichment pattern
  // as requestedServicesByClient/clientsNeedingReview above.
  const { data: relationshipManagerRows } = clientIds.length > 0
    ? await supabase.from("clients").select("id, relationship_manager_id").in("id", clientIds)
    : { data: [] as { id: string; relationship_manager_id: string | null }[] };
  const managerIdByClient = new Map((relationshipManagerRows ?? []).map((r) => [r.id, r.relationship_manager_id]));
  const managerIds = Array.from(new Set((relationshipManagerRows ?? []).map((r) => r.relationship_manager_id).filter((id): id is string => Boolean(id))));
  const { data: managerProfiles } = managerIds.length > 0
    ? await supabase.from("user_profiles").select("id, display_name").in("id", managerIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const managerById = new Map((managerProfiles ?? []).map((p) => [p.id, p]));

  const clientRows: ClientRow[] = (clients ?? []).map((c) => ({
    ...c,
    needsReview: clientsNeedingReview.has(c.id),
    requestedService: requestedServiceLabelByClient.get(c.id) ?? null,
    assignedStaff: resolveAssignedStaff(managerIdByClient.get(c.id) ?? null, managerById),
  }));

  // Every active filter, so switching status/tag or paging never silently
  // drops the others.
  const activeParams = (
    [
      ["status", status],
      ["tag", tag],
      ["q", q],
      ["service", serviceFilter],
      ["staff", staffFilter],
      ["stage", stageFilter],
      ["missingDocs", missingDocuments ? "1" : ""],
      ["balance", outstandingBalance ? "1" : ""],
      ["clientType", clientType],
      ["hasEmail", hasEmail === undefined ? "" : hasEmail ? "1" : "0"],
      ["hasPhone", hasPhone === undefined ? "" : hasPhone ? "1" : "0"],
    ] as [string, string][]
  ).filter(([, v]) => v);
  const extraQuery = activeParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const statusQuery = activeParams.filter(([k]) => k !== "status").length > 0
    ? `&${activeParams.filter(([k]) => k !== "status").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`
    : "";
  const tagQueryBase = `/clients?${activeParams.filter(([k]) => k !== "tag").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;

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
        <ContactsSearchBar
          initialQuery={q}
          basePath="/clients"
          services={serviceFilterOptions}
          staffOptions={staffFilterOptions}
          pipelineStages={pipelineStageOptions}
          activeServiceId={serviceFilter}
          activeStaffId={staffFilter}
          activeStage={stageFilter}
          missingDocuments={missingDocuments}
          outstandingBalance={outstandingBalance}
          clientTypes={CLIENT_TYPE_FILTERS}
          activeClientType={clientType}
          hasEmail={hasEmail}
          hasPhone={hasPhone}
        />
        <div className="mb-2 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `/clients?status=${f.value}${statusQuery}` : `/clients?${statusQuery.replace(/^&/, "")}`}
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
          <ContactsBulkTable
            rows={clientRows}
            workspaceId={workspace.id}
            canManage={Boolean(canCreate)}
            canEdit={Boolean(canEdit)}
            staffOptions={staffFilterOptions}
            emptyMessage={
              q || serviceFilter || staffFilter || stageFilter || missingDocuments || outstandingBalance || clientType || hasEmail !== undefined || hasPhone !== undefined
                ? "No contacts match this search."
                : status
                ? `No clients with status "${STATUS_FILTERS.find((f) => f.value === status)?.label}".`
                : "No clients yet. Add your first client to get started."
            }
            emptyAction={
              !status &&
              !q &&
              !serviceFilter &&
              !staffFilter &&
              !stageFilter &&
              !missingDocuments &&
              !outstandingBalance &&
              !clientType &&
              hasEmail === undefined &&
              hasPhone === undefined &&
              canCreate ? (
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
