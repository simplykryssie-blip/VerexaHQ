import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { roleHasCapability } from "@/lib/permissions/capabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { engagementStatusLabel } from "@/lib/validation/engagements";
import { formatCurrency } from "@/lib/formatters";
import { DollarSign, Users, Briefcase, CheckSquare } from "lucide-react";
import { startOfMonth } from "date-fns";

export default async function ReportsPage() {
  const active = await getActiveWorkspace();
  if (!active) redirect("/workspaces");
  if (!roleHasCapability(active.role, "view_reports")) redirect("/unauthorized");

  const supabase = await createClient();
  const workspaceId = active.workspace.id;
  const monthStart = startOfMonth(new Date()).toISOString();

  const [{ data: paymentsThisMonth }, { data: engagements }, { count: newClientsThisMonth }, { count: totalClients }, { data: tasks }] = await Promise.all([
    supabase.from("payments").select("amount").eq("workspace_id", workspaceId).eq("status", "succeeded").gte("paid_at", monthStart),
    supabase.from("tax_engagements").select("status").eq("workspace_id", workspaceId),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", monthStart),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("archived_at", null),
    supabase.from("tasks").select("status").eq("workspace_id", workspaceId),
  ]);

  const revenueThisMonth = (paymentsThisMonth ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const engagementsByStatus = new Map<string, number>();
  for (const e of engagements ?? []) engagementsByStatus.set(e.status, (engagementsByStatus.get(e.status) ?? 0) + 1);

  const totalTasks = (tasks ?? []).length;
  const completedTasks = (tasks ?? []).filter((t) => t.status === "completed").length;
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Office Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">A snapshot of your workspace this month.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="Revenue this month" value={formatCurrency(revenueThisMonth)} />
        <StatCard icon={Users} label="New clients this month" value={String(newClientsThisMonth ?? 0)} />
        <StatCard icon={Briefcase} label="Total active clients" value={String(totalClients ?? 0)} />
        <StatCard icon={CheckSquare} label="Task completion rate" value={`${taskCompletionRate}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagements by status</CardTitle>
        </CardHeader>
        <CardContent>
          {engagementsByStatus.size === 0 ? (
            <p className="text-sm text-muted-foreground">No engagements yet.</p>
          ) : (
            <ul className="space-y-2">
              {Array.from(engagementsByStatus.entries())
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <span>{engagementStatusLabel(status)}</span>
                    <div className="flex items-center gap-2 flex-1 mx-3">
                      <div className="h-2 flex-1 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-brand-gradient" style={{ width: `${(count / (engagements?.length || 1)) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
