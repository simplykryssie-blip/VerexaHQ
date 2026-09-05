import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Avatar } from "@/components/Avatar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = { active: "success" };

type ClientRef = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  client_type: string;
  lifecycle_status: string;
};

function clientDisplayName(c: ClientRef) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function PreparerProfilePage({ params }: { params: { userId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: member }, { data: roles }, { data: emailRows }] = await Promise.all([
    supabase
      .from("workspace_users")
      .select("id, user_id, status, is_owner, role_id, joined_at")
      .eq("workspace_id", workspace.id)
      .eq("user_id", params.userId)
      .maybeSingle(),
    supabase.from("roles").select("id, name").or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`),
    supabase.rpc("get_workspace_member_emails", { p_workspace_id: workspace.id }),
  ]);

  if (!member) notFound();

  const roleName = (roles ?? []).find((r) => r.id === member.role_id)?.name ?? null;
  const email = (emailRows ?? []).find((r) => r.user_id === member.user_id)?.email ?? null;

  const [{ data: profile }, { data: clientsByRm }, { data: engagementsByStaff }, { data: tasks }, { data: activity }] = await Promise.all([
    supabase.from("user_profiles").select("display_name, avatar_url, phone, ptin_last4, last_seen_at").eq("id", member.user_id).maybeSingle(),
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type, lifecycle_status")
      .eq("workspace_id", workspace.id)
      .eq("relationship_manager_id", member.user_id)
      .limit(200),
    // A client can also show up here via an engagement this person is the
    // assigned preparer on, without being their relationship manager -- the
    // two lists get merged and de-duplicated by client id below.
    supabase
      .from("engagements")
      .select("client_id, clients(id, first_name, last_name, business_name, client_type, lifecycle_status)")
      .eq("workspace_id", workspace.id)
      .eq("assigned_staff_id", member.user_id)
      .limit(200),
    supabase
      .from("tasks")
      .select("id, title, status, due_date")
      .eq("workspace_id", workspace.id)
      .eq("assigned_staff_id", member.user_id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase
      .from("activity_log")
      .select("id, description, created_at")
      .eq("workspace_id", workspace.id)
      .eq("actor_id", member.user_id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const assignedClientsById = new Map<string, ClientRef>();
  for (const c of clientsByRm ?? []) assignedClientsById.set(c.id, c);
  for (const e of engagementsByStaff ?? []) {
    const c = e.clients as unknown as ClientRef | null;
    if (c) assignedClientsById.set(c.id, c);
  }
  const assignedClients = Array.from(assignedClientsById.values());

  const openTasks = (tasks ?? []).filter((t) => t.status !== "completed");
  const completedTasks = (tasks ?? []).filter((t) => t.status === "completed");
  const showPtin = isEroManagementTier(workspace);

  return (
    <div className="max-w-4xl">
      <Link href="/settings/users" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> Back to Team
      </Link>

      <div className="flex items-start gap-4">
        <Avatar name={profile?.display_name ?? null} url={profile?.avatar_url ?? null} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-ink">{profile?.display_name ?? "Unnamed"}</h1>
            {member.is_owner && <Badge tone="accent">Owner</Badge>}
            <Badge tone={STATUS_TONE[member.status] ?? "neutral"} className="capitalize">
              {member.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{roleName ?? "No role assigned"}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Basic information</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd className="text-slate">{email ?? "--"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Phone</dt>
              <dd className="text-slate">{profile?.phone ?? "--"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Date added</dt>
              <dd className="text-slate">{member.joined_at ? new Date(member.joined_at).toLocaleDateString() : "--"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Last activity</dt>
              <dd className="text-slate">{profile?.last_seen_at ? new Date(profile.last_seen_at).toLocaleString() : "Never"}</dd>
            </div>
          </dl>
        </div>

        {showPtin && (
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-ink">Professional information</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">PTIN</dt>
                <dd className="text-slate">{profile?.ptin_last4 ? `••••${profile.ptin_last4}` : "Not set"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Set by this person from their own Profile settings.</p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Workload</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Assigned clients</dt>
              <dd className="text-slate">{assignedClients.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Open tasks</dt>
              <dd className="text-slate">{openTasks.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Completed tasks</dt>
              <dd className="text-slate">{completedTasks.length}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Permissions</h2>
          <p className="mt-2 text-sm text-muted">Controlled by this person&apos;s role ({roleName ?? "no role"}).</p>
          <Link href="/settings/roles" className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
            View or edit role permissions &rarr;
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Assigned clients</h2>
        {assignedClients.length === 0 ? (
          <EmptyState message="No clients assigned to this person yet." />
        ) : (
          <>
            <ul className="mt-3 divide-y divide-border">
              {assignedClients.slice(0, 25).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/clients/${c.id}`} className="text-slate hover:text-accent hover:underline">
                    {clientDisplayName(c)}
                  </Link>
                  <span className="text-xs capitalize text-muted">{c.lifecycle_status}</span>
                </li>
              ))}
            </ul>
            {assignedClients.length > 25 && (
              <p className="mt-2 text-xs text-muted">+{assignedClients.length - 25} more</p>
            )}
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Open tasks</h2>
          {openTasks.length === 0 ? (
            <EmptyState message="No open tasks." />
          ) : (
            <>
              <ul className="mt-3 divide-y divide-border">
                {openTasks.slice(0, 25).map((t) => (
                  <li key={t.id} className="py-2.5 text-sm">
                    <p className="text-slate">{t.title}</p>
                    {t.due_date && <p className="text-xs text-muted">Due {new Date(t.due_date).toLocaleDateString()}</p>}
                  </li>
                ))}
              </ul>
              {openTasks.length > 25 && <p className="mt-2 text-xs text-muted">+{openTasks.length - 25} more</p>}
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          {(activity ?? []).length === 0 ? (
            <EmptyState message="No recent activity." />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {(activity ?? []).map((a) => (
                <li key={a.id} className="py-2.5 text-sm">
                  <p className="text-slate">{a.description}</p>
                  <p className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
