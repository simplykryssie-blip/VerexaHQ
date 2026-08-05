import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "security-events", label: "Security Events" },
  { key: "sensitive-reveals", label: "Sensitive Data Reveals" },
  { key: "failed-logins", label: "Failed Logins" },
  { key: "mfa-status", label: "MFA Status" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function ComplianceReportPage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  // These views' own RLS restricts rows to workspace admins (compliance
  // data is admin-only regardless of the compliance.view permission), so
  // the page gate matches that instead of the broader permission check.
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    return (
      <ReportLayout title="Compliance">
        <EmptyState message="Compliance reports are visible to workspace admins only." />
      </ReportLayout>
    );
  }

  const activeTab: TabKey = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as TabKey) : "security-events";

  const tabNav = (
    <nav className="flex gap-1 border-b border-border print:hidden">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/reports/compliance?tab=${t.key}`}
          className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (activeTab === "security-events") {
    const { data: events } = await supabase
      .from("compliance_security_events_view")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const csvRows = (events ?? []).map((e) => ({ Action: e.action ?? "", Severity: e.severity ?? "", "Entity type": e.entity_type ?? "", Date: e.created_at ?? "" }));

    return (
      <ReportLayout title="Compliance" description="Security-relevant events and sensitive-data access." filters={tabNav} actions={<ExportButtons rows={csvRows} filename="compliance-security-events" />}>
        {(events ?? []).length === 0 ? (
          <EmptyState message="No security events recorded." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate">
                  {e.action} <span className="text-xs text-muted">({e.entity_type})</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {e.severity && <span className="capitalize text-danger">{e.severity}</span>}
                  {e.created_at && new Date(e.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ReportLayout>
    );
  }

  if (activeTab === "sensitive-reveals") {
    const { data: reveals } = await supabase
      .from("compliance_sensitive_data_reveals_view")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const csvRows = (reveals ?? []).map((r) => ({ Action: r.action ?? "", "Entity type": r.entity_type ?? "", Date: r.created_at ?? "" }));

    return (
      <ReportLayout title="Compliance" description="Security-relevant events and sensitive-data access." filters={tabNav} actions={<ExportButtons rows={csvRows} filename="compliance-sensitive-reveals" />}>
        {(reveals ?? []).length === 0 ? (
          <EmptyState message="No sensitive data has been revealed." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(reveals ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate">
                  {r.action} <span className="text-xs text-muted">({r.entity_type})</span>
                </span>
                <span className="text-xs text-muted">{r.created_at && new Date(r.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </ReportLayout>
    );
  }

  if (activeTab === "failed-logins") {
    const { data: logins } = await supabase
      .from("compliance_failed_logins_view")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const csvRows = (logins ?? []).map((l) => ({
      User: l.display_name ?? "Unknown",
      Reason: l.failure_reason ?? "",
      "IP address": l.ip_address ? String(l.ip_address) : "",
      Date: l.created_at ?? "",
    }));

    return (
      <ReportLayout title="Compliance" description="Security-relevant events and sensitive-data access." filters={tabNav} actions={<ExportButtons rows={csvRows} filename="compliance-failed-logins" />}>
        {(logins ?? []).length === 0 ? (
          <EmptyState message="No failed login attempts recorded." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(logins ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate">{l.display_name ?? "Unknown"}</span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {l.failure_reason && <span>{l.failure_reason}</span>}
                  {l.created_at && new Date(l.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ReportLayout>
    );
  }

  // mfa-status
  const { data: mfa } = await supabase.from("compliance_mfa_status_view").select("*").eq("workspace_id", workspace.id);
  const enabledCount = (mfa ?? []).filter((m) => m.mfa_enabled).length;
  const csvRows = (mfa ?? []).map((m) => ({ Staff: m.display_name ?? "Unknown", Role: m.role_name ?? "", "MFA enabled": m.mfa_enabled ? "Yes" : "No" }));

  return (
    <ReportLayout
      title="Compliance"
      description={`Security-relevant events and sensitive-data access -- ${enabledCount} of ${(mfa ?? []).length} staff have MFA enabled.`}
      filters={tabNav}
      actions={<ExportButtons rows={csvRows} filename="compliance-mfa-status" />}
    >
      {(mfa ?? []).length === 0 ? (
        <EmptyState message="No staff found." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(mfa ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate">{m.display_name ?? "Unknown"}</span>
                <span className="ml-2 text-xs text-muted">{m.role_name}</span>
              </div>
              <span className={`text-xs font-medium ${m.mfa_enabled ? "text-green-700" : "text-danger"}`}>{m.mfa_enabled ? "MFA enabled" : "MFA disabled"}</span>
            </li>
          ))}
        </ul>
      )}
    </ReportLayout>
  );
}
