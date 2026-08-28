import { createClient } from "@/lib/supabase/server";
import { Lock, Sparkles, FlaskConical, ShieldCheck, Workflow, Gauge } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import type { LucideIcon } from "lucide-react";
import { PlatformAdminTabs } from "../PlatformAdminTabs";
import { AiOperatorsManager } from "./AiOperatorsManager";

export const dynamic = "force-dynamic";

const AGENT_ICONS: Record<string, LucideIcon> = {
  qa: FlaskConical,
  security: ShieldCheck,
  workflow: Workflow,
  performance: Gauge,
};

const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const RUN_STATUS_TONE: Record<string, BadgeTone> = {
  running: "accent",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

export default async function AdminAiAgentsPage() {
  const supabase = createClient();
  const [{ data: canAccess }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.rpc("can_access_admin_ai"),
    supabase.rpc("is_platform_admin"),
  ]);

  if (!canAccess) {
    return (
      <>
        <PageHeader title="Verexa Admin AI" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins and authorized Admin AI operators." />
          </div>
        </div>
      </>
    );
  }

  const [{ data: agents }, { data: recentRuns }, { data: recentFindings }, { data: aiOperators }] = await Promise.all([
    supabase.from("ai_agents").select("*").order("agent_key"),
    supabase
      .from("ai_agent_runs")
      .select("id, run_type, status, started_at, completed_at, workspace_id, ai_agents(name, agent_key), workspaces(name)")
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("ai_agent_findings")
      .select("id, title, severity, status, category, created_at, ai_agents(name, agent_key)")
      .order("created_at", { ascending: false })
      .limit(10),
    isPlatformAdmin ? supabase.from("user_profiles").select("id, display_name").eq("is_platform_ai_operator", true).order("display_name") : Promise.resolve({ data: [] }),
  ]);

  const agentRows = agents ?? [];
  const anyEnabled = agentRows.some((a) => a.is_enabled);
  const openCriticalOrHigh = (recentFindings ?? []).filter(
    (f) => f.status !== "resolved" && f.status !== "fixed" && (f.severity === "critical" || f.severity === "high")
  ).length;

  return (
    <>
      <PageHeader
        title="Verexa Admin AI"
        description="Platform-monitoring and testing agents that run against demo workspaces only -- QA, Security, Workflow, and Performance."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        {isPlatformAdmin && <PlatformAdminTabs active="ai-agents" />}

        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accentSoft text-accent">
              <Sparkles size={17} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">System health</p>
              <p className="text-xs text-muted">
                {anyEnabled
                  ? `${openCriticalOrHigh} open critical/high finding${openCriticalOrHigh === 1 ? "" : "s"} across all agents.`
                  : "No agents are enabled yet -- QA, Security, Workflow, and Performance execution ships in later phases. This page is the real, live foundation (agent registry, run tracking, findings, evidence) with nothing faked."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surfaceMuted p-4 text-xs text-muted">
          <p className="font-medium text-ink">How a run gets started</p>
          <p className="mt-1">
            These agents run as Claude Code sessions, not a button that quietly calls an AI API on its own -- ask Claude Code directly (&quot;run the
            QA agent against the ERO demo workspace&quot;) for an on-demand check, or ask for a scheduled Routine to run one automatically on a
            cadence. Either way, every run and finding shows up below in real time as it happens.
          </p>
        </div>

        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Agents</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {agentRows.map((agent) => {
              const Icon = AGENT_ICONS[agent.agent_key] ?? Sparkles;
              return (
                <div key={agent.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accentSoft text-accent">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <Badge tone={agent.is_enabled ? "success" : "neutral"}>{agent.is_enabled ? "Enabled" : "Not yet implemented"}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-ink">{agent.name}</p>
                  <p className="mt-1 text-xs text-muted">{agent.description}</p>
                  <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted">
                    <p>Last run: {agent.last_run_at ? new Date(agent.last_run_at).toLocaleString() : "Never"}</p>
                    <p>Last success: {agent.last_success_run_at ? new Date(agent.last_success_run_at).toLocaleString() : "Never"}</p>
                    <p>Last failure: {agent.last_failure_run_at ? new Date(agent.last_failure_run_at).toLocaleString() : "Never"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Recent findings</h2>
          {!recentFindings || recentFindings.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState icon={Sparkles} message="No findings yet -- none of the agents have run." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Finding</th>
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Severity</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Detected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentFindings.map((f) => (
                    <tr key={f.id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-5 py-3 text-slate">{f.title}</td>
                      <td className="px-5 py-3 text-slate">{(f.ai_agents as unknown as { name: string } | null)?.name ?? "--"}</td>
                      <td className="px-5 py-3">
                        <Badge tone={SEVERITY_TONE[f.severity] ?? "neutral"} className="capitalize">
                          {f.severity}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate capitalize">{f.status.replace(/_/g, " ")}</td>
                      <td className="px-5 py-3 text-slate">{new Date(f.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Recent runs</h2>
          {!recentRuns || recentRuns.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState icon={Sparkles} message="No runs yet." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentRuns.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-5 py-3 text-slate">{(r.ai_agents as unknown as { name: string } | null)?.name ?? "--"}</td>
                      <td className="px-5 py-3 text-slate">{(r.workspaces as unknown as { name: string } | null)?.name ?? "--"}</td>
                      <td className="px-5 py-3 text-slate capitalize">{r.run_type}</td>
                      <td className="px-5 py-3">
                        <Badge tone={RUN_STATUS_TONE[r.status] ?? "neutral"} className="capitalize">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate">{new Date(r.started_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isPlatformAdmin && (
          <div>
            <h3 className="font-display text-sm font-semibold text-ink">Admin AI operators</h3>
            <p className="mt-1 text-xs text-muted">
              Delegate access to this page and its agents without granting full platform-admin rights. Platform admins always have access.
            </p>
            <div className="mt-3">
              <AiOperatorsManager operators={aiOperators ?? []} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
