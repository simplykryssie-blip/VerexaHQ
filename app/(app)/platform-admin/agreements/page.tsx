import { createClient } from "@/lib/supabase/server";
import { Lock, FileCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { PlatformAdminTabs } from "../PlatformAdminTabs";
import { LEGAL_VERSION } from "@/lib/legal";

export const dynamic = "force-dynamic";

export default async function PlatformAgreementsPage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Agreements" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins." />
          </div>
        </div>
      </>
    );
  }

  const { data: statuses } = await supabase.rpc("get_platform_terms_acceptance_status", { p_version: LEGAL_VERSION });
  const rows = statuses ?? [];
  const acceptedCount = rows.filter((r) => r.accepted).length;

  return (
    <>
      <PageHeader
        title="Agreements"
        description={`Who has acknowledged the current Terms of Service and Privacy Policy (version ${LEGAL_VERSION}) -- account holders are required to accept before using Verexa.`}
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <PlatformAdminTabs active="agreements" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Account holders</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Accepted</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{acceptedCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Not yet accepted</p>
            <p className={`mt-1 text-2xl font-semibold ${rows.length - acceptedCount > 0 ? "text-warning" : "text-ink"}`}>
              {rows.length - acceptedCount}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={FileCheck} message="No account holders yet." />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Account holder</th>
                  <th className="px-5 py-3 font-medium">Workspace</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Accepted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={`${r.workspace_id}-${r.user_id}`} className="hover:bg-surfaceMuted">
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{r.display_name ?? "--"}</p>
                      <p className="text-xs text-muted">{r.email}</p>
                    </td>
                    <td className="px-5 py-3 text-slate">{r.workspace_name}</td>
                    <td className="px-5 py-3">
                      <Badge tone={r.accepted ? "success" : "warning"}>{r.accepted ? "Accepted" : "Pending"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate">{r.accepted_at ? new Date(r.accepted_at).toLocaleString() : <span className="text-muted">--</span>}</td>
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
