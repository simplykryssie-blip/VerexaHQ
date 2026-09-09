import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Lock, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  open: "danger",
  reopened: "danger",
  investigating: "warning",
  retest_required: "warning",
  fixed: "success",
  resolved: "success",
};

const AGENT_OPTIONS = [
  { value: "", label: "All agents" },
  { value: "qa", label: "QA" },
  { value: "security", label: "Security" },
  { value: "workflow", label: "Workflow" },
  { value: "performance", label: "Performance" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "retest_required", label: "Retest required" },
  { value: "reopened", label: "Reopened" },
  { value: "fixed", label: "Fixed" },
  { value: "resolved", label: "Resolved" },
];

const PAGE_SIZE = 50;

export default async function AiAgentFindingsPage({
  searchParams,
}: {
  searchParams: { agent?: string; severity?: string; status?: string; page?: string };
}) {
  const supabase = createClient();
  const { data: canAccess } = await supabase.rpc("can_access_admin_ai");

  if (!canAccess) {
    return (
      <>
        <PageHeader title="Findings" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins and authorized Admin AI operators." />
          </div>
        </div>
      </>
    );
  }

  const agentFilter = searchParams.agent ?? "";
  const severityFilter = searchParams.severity ?? "";
  const statusFilter = searchParams.status ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("ai_agent_findings")
    .select("id, title, severity, status, category, affected_module, created_at, last_detected_at, ai_agents!inner(name, agent_key), workspaces(name)", {
      count: "exact",
    })
    .order("last_detected_at", { ascending: false })
    .range(from, to);

  if (agentFilter) query = query.eq("ai_agents.agent_key", agentFilter);
  if (severityFilter) query = query.eq("severity", severityFilter);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: findings, count } = await query;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: Record<string, string | number>) {
    const params = new URLSearchParams();
    const merged = { agent: agentFilter, severity: severityFilter, status: statusFilter, page: String(page), ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      const v = String(value);
      if (v) params.set(key, v);
    }
    const qs = params.toString();
    return qs ? `/platform-admin/ai-agents/findings?${qs}` : "/platform-admin/ai-agents/findings";
  }

  return (
    <>
      <PageHeader title="Findings" description="Every finding any Admin AI agent has ever recorded -- open and resolved." />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="flex items-center justify-between">
          <Link href="/platform-admin/ai-agents" className="text-sm font-medium text-accent hover:underline">
            &larr; Back to AI Agents
          </Link>
          <p className="text-xs text-muted">
            {total} finding{total === 1 ? "" : "s"} matching current filters
          </p>
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <FilterSelect name="agent" label="Agent" options={AGENT_OPTIONS} value={agentFilter} />
          <FilterSelect name="severity" label="Severity" options={SEVERITY_OPTIONS} value={severityFilter} />
          <FilterSelect name="status" label="Status" options={STATUS_OPTIONS} value={statusFilter} />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Apply filters
          </button>
          {(agentFilter || severityFilter || statusFilter) && (
            <Link href="/platform-admin/ai-agents/findings" className="text-sm text-muted hover:text-ink">
              Clear
            </Link>
          )}
        </form>

        {!findings || findings.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Sparkles} message="No findings match these filters." />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Finding</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Workspace</th>
                  <th className="px-5 py-3 font-medium">Module</th>
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">First seen</th>
                  <th className="px-5 py-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {findings.map((f) => (
                  <tr key={f.id} className="transition-colors hover:bg-surfaceMuted">
                    <td className="px-5 py-3 text-slate">{f.title}</td>
                    <td className="px-5 py-3 text-slate">{(f.ai_agents as unknown as { name: string } | null)?.name ?? "--"}</td>
                    <td className="px-5 py-3 text-slate">{(f.workspaces as unknown as { name: string } | null)?.name ?? "--"}</td>
                    <td className="px-5 py-3 text-slate">{f.affected_module ?? "--"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={SEVERITY_TONE[f.severity] ?? "neutral"} className="capitalize">
                        {f.severity}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[f.status] ?? "neutral"} className="capitalize">
                        {f.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-slate">{new Date(f.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-slate">{new Date(f.last_detected_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={buildHref({ page: page - 1 })} className="rounded-lg border border-border px-3 py-1.5 font-medium text-slate hover:bg-surfaceMuted">
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link href={buildHref({ page: page + 1 })} className="rounded-lg border border-border px-3 py-1.5 font-medium text-slate hover:bg-surfaceMuted">
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function FilterSelect({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
