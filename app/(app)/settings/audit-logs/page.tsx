import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export const dynamic = 'force-dynamic';

export default async function AuditLogsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: logs } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, severity, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader icon={ScrollText} title="Audit Logs" description="The last 50 audit events for this workspace." />

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {!logs || logs.length === 0 ? (
          <EmptyState icon={ScrollText} message="No audit events recorded yet." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Entity</th>
                <th className="px-5 py-3 font-medium">Severity</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-3 text-slate">{l.action}</td>
                  <td className="px-5 py-3 text-slate">{l.entity_type}</td>
                  <td className="px-5 py-3 capitalize text-slate">{l.severity}</td>
                  <td className="px-5 py-3 text-xs text-muted">{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
