import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

export const dynamic = 'force-dynamic';

async function getCounts(workspaceId: string) {
  const supabase = createClient();

  const [clients, openEngagements, dueTasks] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("engagements")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("Completed","Archived")'),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "completed"),
  ]);

  return {
    clients: clients.count ?? 0,
    openEngagements: openEngagements.count ?? 0,
    dueTasks: dueTasks.count ?? 0,
  };
}

async function getRecentActivity(workspaceId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("activity_log")
    .select("id, description, activity_type, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(8);
  return data ?? [];
}

export default async function DashboardPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const [counts, activity] = await Promise.all([
    getCounts(workspace.id),
    getRecentActivity(workspace.id),
  ]);

  const stats = [
    { label: "Clients", value: counts.clients, href: "/clients" },
    { label: "Open Engagements", value: counts.openEngagements, href: "/engagements" },
    { label: "Open Tasks", value: counts.dueTasks, href: "/engagements" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description={`Welcome back to ${workspace.name}.`} />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-xl border border-border bg-surface p-5 transition hover:border-accent"
            >
              <p className="text-sm text-muted">{s.label}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{s.value}</p>
            </Link>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          </div>
          {activity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Nothing has happened yet -- activity will show up here as you work.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-slate">{a.description}</span>
                  <span className="text-xs text-muted">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
