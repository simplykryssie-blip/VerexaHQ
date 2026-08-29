import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { BulkAssignList, type AssignableRow } from "@/components/assignments/BulkAssignList";

export const dynamic = "force-dynamic";

type Tab = "clients" | "tasks" | "engagements";
const TABS: { key: Tab; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "tasks", label: "Tasks" },
  { key: "engagements", label: "Engagements" },
];

const ENGAGEMENT_ROLES = [
  { key: "assigned_staff_id", label: "Assigned staff" },
  { key: "reviewer_id", label: "Reviewer" },
  { key: "compliance_officer_id", label: "Compliance officer" },
] as const;
type EngagementRoleKey = (typeof ENGAGEMENT_ROLES)[number]["key"];

function clientLabelFor(c: { first_name: string | null; last_name: string | null; business_name: string | null; client_type: string }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function AssignmentsPage({ searchParams }: { searchParams: { tab?: string; role?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const tab: Tab = searchParams.tab === "tasks" ? "tasks" : searchParams.tab === "engagements" ? "engagements" : "clients";
  const engagementRole: EngagementRoleKey =
    ENGAGEMENT_ROLES.find((r) => r.key === searchParams.role)?.key ?? "assigned_staff_id";

  const supabase = createClient();
  // Mirrors the real RLS UPDATE policies on each table exactly -- clients_update
  // requires clients.edit, tasks_update and engagements_update require
  // engagements.manage (engagements_update also accepts engagements.assign).
  // Gating the whole page on just one of these would let someone with, say,
  // engagements.manage but not clients.edit see a working-looking Clients
  // bulk editor whose writes then silently fail RLS.
  const [staff, { data: canEditClients }, { data: canManageEngagements }, { data: canAssignEngagements }] = await Promise.all([
    getWorkspaceStaff(supabase, workspace.id),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.edit" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.manage" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.assign" }),
  ]);
  const staffOptions = staff.map((s) => ({ id: s.user_id, display_name: s.display_name }));
  const staffNameById = new Map(staffOptions.map((s) => [s.id, s.display_name]));
  const canManage =
    tab === "clients" ? Boolean(canEditClients) : tab === "tasks" ? Boolean(canManageEngagements) : Boolean(canManageEngagements || canAssignEngagements);

  let rows: AssignableRow[] = [];
  let table: "clients" | "tasks" | "engagements" = "clients";
  let field = "relationship_manager_id";
  let emptyMessage = "No clients yet.";

  if (tab === "clients") {
    const { data } = await supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type, lifecycle_status, relationship_manager_id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200);
    field = "relationship_manager_id";
    emptyMessage = "No clients yet.";
    rows = (data ?? []).map((c) => ({
      id: c.id,
      label: clientLabelFor(c),
      sublabel: c.lifecycle_status,
      href: `/clients/${c.id}`,
      currentAssigneeName: c.relationship_manager_id ? (staffNameById.get(c.relationship_manager_id) ?? "Unknown") : null,
    }));
  } else if (tab === "tasks") {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, due_date, assigned_staff_id, engagement_id, client_id")
      .eq("workspace_id", workspace.id)
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    table = "tasks";
    field = "assigned_staff_id";
    emptyMessage = "No open tasks.";
    rows = (data ?? []).map((t) => ({
      id: t.id,
      label: t.title,
      sublabel: t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString()}` : null,
      href: t.engagement_id ? `/engagements/${t.engagement_id}` : t.client_id ? `/clients/${t.client_id}` : null,
      currentAssigneeName: t.assigned_staff_id ? (staffNameById.get(t.assigned_staff_id) ?? "Unknown") : null,
    }));
  } else {
    const { data } = await supabase
      .from("engagements")
      .select(
        "id, engagement_number, status, assigned_staff_id, reviewer_id, compliance_officer_id, clients(first_name, last_name, business_name, client_type)"
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200);
    table = "engagements";
    field = engagementRole;
    emptyMessage = "No engagements yet.";
    rows = (data ?? []).map((e) => {
      const c = e.clients as unknown as {
        first_name: string | null;
        last_name: string | null;
        business_name: string | null;
        client_type: string;
      } | null;
      const currentId = (e as unknown as Record<EngagementRoleKey, string | null>)[engagementRole];
      return {
        id: e.id,
        label: `${e.engagement_number} — ${c ? clientLabelFor(c) : "Unknown client"}`,
        sublabel: e.status,
        href: `/engagements/${e.id}`,
        currentAssigneeName: currentId ? (staffNameById.get(currentId) ?? "Unknown") : null,
      };
    });
  }

  return (
    <>
      <PageHeader title="Assignments" description="Reassign clients, tasks, and engagements across your team in bulk." />
      <div className="flex-1 px-8 py-6">
        <nav className="mb-4 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/assignments?tab=${t.key}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === "engagements" && (
          <div className="mb-4 flex gap-1">
            {ENGAGEMENT_ROLES.map((r) => (
              <Link
                key={r.key}
                href={`/assignments?tab=engagements&role=${r.key}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  engagementRole === r.key ? "bg-accent text-white" : "bg-surfaceMuted text-muted hover:text-ink"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        )}

        {!canManage ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="You don't have permission to reassign work in this workspace." />
          </div>
        ) : (
          <BulkAssignList
            key={`${tab}-${engagementRole}`}
            rows={rows}
            staffOptions={staffOptions}
            table={table}
            field={field}
            entityNoun={tab === "clients" ? "client" : tab === "tasks" ? "task" : "engagement"}
            emptyMessage={emptyMessage}
          />
        )}
      </div>
    </>
  );
}
