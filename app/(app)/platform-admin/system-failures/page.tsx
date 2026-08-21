import { createClient } from "@/lib/supabase/server";
import { Lock, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function PlatformAdminSystemFailuresPage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="System Failures" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins." />
          </div>
        </div>
      </>
    );
  }

  const { data: failures } = await supabase
    .from("system_failure_log")
    .select("id, source, workspace_id, message, context, created_at, notified_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const workspaceIds = Array.from(new Set((failures ?? []).map((f) => f.workspace_id).filter((id): id is string => Boolean(id))));
  const { data: workspaces } = workspaceIds.length > 0 ? await supabase.from("workspaces").select("id, name").in("id", workspaceIds) : { data: [] };
  const workspaceNameById = new Map((workspaces ?? []).map((w) => [w.id, w.name]));

  const rows = failures ?? [];
  const unnotifiedCount = rows.filter((f) => !f.notified_at).length;

  return (
    <>
      <PageHeader
        backHref="/platform-admin"
        backLabel="Back to all workspaces"
        title="System Failures"
        description="Failures nobody outside Verexa could fix -- missing templates/env vars, storage or DB errors, Resend outages or key issues. Also emailed as a digest to failedsystem@verexahq.com every 20 minutes."
      />
      <div className="flex-1 space-y-4 px-8 py-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Showing</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Not yet digested</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{unnotifiedCount}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={ShieldAlert} message="No system failures logged." />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Workspace</th>
                  <th className="px-5 py-3 font-medium">Message</th>
                  <th className="px-5 py-3 font-medium">Digest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((f) => (
                  <tr key={f.id} className="hover:bg-surfaceMuted">
                    <td className="whitespace-nowrap px-5 py-3 text-slate">{new Date(f.created_at).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">{f.source}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate">
                      {f.workspace_id ? (workspaceNameById.get(f.workspace_id) ?? f.workspace_id) : <span className="text-muted">--</span>}
                    </td>
                    <td className="px-5 py-3 text-slate">{f.message}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {f.notified_at ? (
                        <Badge tone="neutral">Sent</Badge>
                      ) : (
                        <Badge tone="warning">Pending</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
