"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";

type ChecklistItem = {
  checklist_code: string;
  checklist_name: string;
  notes: string | null;
  display_order: number | null;
};

type ReadinessRow = {
  category: string | null;
  total_items: number | null;
  completed_items: number | null;
  open_items: number | null;
  required_items: number | null;
  required_completed_items: number | null;
  required_open_items: number | null;
  testing_status: string | null;
  open_required_items: ChecklistItem[] | null;
  generated_at: string | null;
};

type ProviderRequirement = {
  requirement_code: string;
  provider_key: string;
  provider_name: string;
  provider_category: string | null;
  edge_function_name: string | null;
  secret_name: string;
  verification_status: string;
  required_before_beta: boolean;
  required_before_paid_launch: boolean;
  last_verified_at: string | null;
  notes: string | null;
  connection_status: string | null;
};

type EdgeTest = {
  test_code: string;
  test_name: string;
  test_status: string;
  edge_function_name: string;
  provider_key: string | null;
  blocks_beta: boolean;
  blocks_paid_launch: boolean;
  last_attempted_at: string | null;
  last_passed_at: string | null;
  last_error: string | null;
  implementation_status: string | null;
};

type ScheduledJob = {
  id: string;
  job_name: string;
  job_category: string | null;
  is_active: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_status: string | null;
  last_error: string | null;
};

type Blocker = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  severity: string | null;
  required_before_beta: boolean;
  required_before_paid_launch: boolean;
};

type BackendReadiness = {
  summary: {
    launch_checklist_total: number;
    launch_checklist_completed: number;
    launch_checklist_required_open: number;
    launch_blockers_open: number;
    launch_checks_open: number;
    scheduled_jobs_active: number;
    notification_queue_pending: number;
    portal_access_invited: number;
    workspaces_total: number;
    clients_total: number;
  };
  open_blockers: Blocker[];
  scheduled_jobs: ScheduledJob[];
};

type ProviderReadiness = {
  summary: {
    total_secret_requirements: number;
    verified_secret_requirements: number;
    not_verified_secret_requirements: number;
    blocked_secret_requirements: number;
    beta_required_not_verified: number;
    paid_required_not_verified: number;
  };
  requirements: ProviderRequirement[];
  manual_next_steps: string[];
};

type EdgeReadiness = {
  summary: {
    total_tests: number;
    passed_tests: number;
    pending_tests: number;
    failed_tests: number;
    beta_blocking_tests_not_passed: number;
    beta_required_secrets_not_verified: number;
  };
  tests: EdgeTest[];
};

function CategoryStatusPill({ status }: { status: string | null }) {
  const s = status || "unknown";
  const style =
    s === "ready_for_testing"
      ? "bg-emerald-50 text-emerald-700"
      : s === "almost_ready"
        ? "bg-amber-50 text-amber-700"
        : "bg-brick/10 text-brick";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {s.replaceAll("_", " ")}
    </span>
  );
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const s = (status || "unknown").toLowerCase();
  const isGood = ["verified", "passed", "connected", "success", "active"].includes(s);
  const isBad = ["blocked", "failed", "error", "not_verified"].includes(s);
  const Icon = isGood ? CheckCircle2 : isBad ? XCircle : Clock;
  const color = isGood
    ? "bg-emerald-50 text-emerald-700"
    : isBad
      ? "bg-brick/10 text-brick"
      : "bg-amber-50 text-amber-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      <Icon size={12} />
      {(status || "unknown").replaceAll("_", " ")}
    </span>
  );
}

function SummaryGrid({ summary }: { summary: Record<string, number> }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Object.entries(summary).map(([key, value]) => (
        <div key={key} className="rounded-xl bg-paper p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            {key.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-lg font-bold text-ink">{value}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, blocker, children }: { title: string; blocker?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-ink">{title}</h2>
        {blocker && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brick/10 px-2 py-0.5 text-xs font-semibold text-brick">
            <AlertTriangle size={11} /> Beta blocker
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export default function SystemHealthPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReadinessRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [backend, setBackend] = useState<BackendReadiness | null>(null);
  const [providers, setProviders] = useState<ProviderReadiness | null>(null);
  const [edgeTests, setEdgeTests] = useState<EdgeReadiness | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data: ok } = await supabase.rpc("is_platform_admin");
    setAllowed(ok === true);
    if (ok === true) {
      const [dashboardRes, backendRes, providerRes, edgeRes] = await Promise.all([
        supabase.rpc("admin_launch_readiness_dashboard"),
        supabase.rpc("admin_backend_readiness_state"),
        supabase.rpc("admin_provider_secret_readiness_status"),
        supabase.rpc("admin_beta_edge_secret_verification_status"),
      ]);
      const firstError = dashboardRes.error || backendRes.error || providerRes.error || edgeRes.error;
      if (firstError) {
        setError(friendlyError(firstError, "Couldn't load system health data."));
      } else {
        const list = (dashboardRes.data as ReadinessRow[]) ?? [];
        setRows(list);
        setGeneratedAt(list[0]?.generated_at ?? null);
        setBackend(backendRes.data as BackendReadiness);
        setProviders(providerRes.data as ProviderReadiness);
        setEdgeTests(edgeRes.data as EdgeReadiness);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (allowed === null || loading) {
    return <p className="text-muted">Checking access…</p>;
  }
  if (!allowed) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center">
        <Shield className="mx-auto text-muted" />
        <h1 className="mt-3 text-xl font-bold">Protected area</h1>
        <p className="mt-1 text-sm text-muted">
          Platform administrator access is required.
        </p>
      </div>
    );
  }

  const blockedCategories = rows.filter((r) => r.testing_status === "blocked");

  return (
    <div>
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={14} /> Platform readiness
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">System health</h1>
          <p className="mt-1 text-sm text-muted">
            Live backend, launch-checklist, provider secret, and Edge Function readiness. Hidden
            from firm users. No secret values are ever shown here.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {generatedAt && (
        <p className="mt-2 text-xs text-muted">
          Launch checklist generated {new Date(generatedAt).toLocaleString()}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      {!error && rows.length === 0 && !backend && (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No launch-readiness data is available yet.
        </div>
      )}

      {blockedCategories.length > 0 && (
        <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={14} /> {blockedCategories.length} launch-checklist categor
            {blockedCategories.length === 1 ? "y is" : "ies are"} blocked with more than 3 open
            required items.
          </span>
        </div>
      )}

      <div className="mt-5 space-y-5">
        {rows.length > 0 && (
          <Panel title="Launch checklist by category">
            <div className="mt-1 space-y-3">
              {rows.map((r, i) => (
                <div key={r.category ?? i} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{r.category || "Readiness area"}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted">
                        {r.completed_items ?? 0}/{r.total_items ?? 0}
                      </span>
                      <CategoryStatusPill status={r.testing_status} />
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-paper">
                    <div
                      className="brand-gradient h-2 rounded-full"
                      style={{
                        width: `${r.total_items ? Math.round(((r.completed_items ?? 0) / r.total_items) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  {r.required_open_items ? (
                    <p className="mt-2 text-xs text-muted">
                      {r.required_open_items} required item{r.required_open_items === 1 ? "" : "s"} still
                      open before beta testing.
                    </p>
                  ) : null}
                  {r.open_required_items && r.open_required_items.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                      {r.open_required_items.map((item) => (
                        <div key={item.checklist_code} className="text-sm text-ink">
                          <span className="font-semibold">{item.checklist_name}</span>
                          {item.notes && <span className="text-muted"> — {item.notes}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {backend && (
          <Panel title="Backend readiness (database, scheduler, notifications, portal)" blocker={backend.summary.launch_blockers_open > 0}>
            <SummaryGrid summary={backend.summary as unknown as Record<string, number>} />
            {backend.open_blockers.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">
                  Open launch blockers
                </div>
                {backend.open_blockers.map((b) => (
                  <div key={b.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{b.title}</span>
                      <StatusPill status={b.status} />
                    </div>
                    {b.description && <p className="mt-1 text-sm text-muted">{b.description}</p>}
                    <div className="mt-1 flex gap-2 text-xs text-muted">
                      {b.required_before_beta && <span>Blocks beta</span>}
                      {b.required_before_paid_launch && <span>Blocks paid launch</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {backend.scheduled_jobs.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Scheduled jobs</div>
                <div className="mt-2 space-y-2">
                  {backend.scheduled_jobs.map((j) => (
                    <div key={j.id} className="flex items-center justify-between rounded-xl border border-line p-3">
                      <div>
                        <div className="font-semibold text-ink">{j.job_name}</div>
                        <div className="text-xs text-muted">
                          {j.job_category || "General"} · {j.is_active ? "Active" : "Inactive"}
                          {j.last_error ? ` · ${j.last_error}` : ""}
                        </div>
                      </div>
                      <StatusPill status={j.last_status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}

        {providers && (
          <Panel
            title="Provider secrets (Stripe, Email, SMS, Identity Vault, Scheduler, Export)"
            blocker={providers.summary.beta_required_not_verified > 0}
          >
            <SummaryGrid summary={providers.summary as unknown as Record<string, number>} />
            <div className="mt-4 space-y-2">
              {providers.requirements.map((r) => (
                <div key={r.requirement_code} className="flex items-center justify-between rounded-xl border border-line p-3">
                  <div>
                    <div className="font-semibold text-ink">{r.provider_name}</div>
                    <div className="text-xs text-muted">
                      {r.secret_name}
                      {r.edge_function_name ? ` · ${r.edge_function_name}` : ""}
                      {r.required_before_beta ? " · required before beta" : ""}
                      {r.required_before_paid_launch ? " · required before paid launch" : ""}
                    </div>
                    {r.notes && <div className="mt-1 text-xs text-muted">{r.notes}</div>}
                  </div>
                  <StatusPill status={r.verification_status} />
                </div>
              ))}
            </div>
            {providers.manual_next_steps?.length > 0 && (
              <div className="mt-4 rounded-xl bg-paper p-3">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Manual next steps</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink">
                  {providers.manual_next_steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        )}

        {edgeTests && (
          <Panel title="Edge Function verification tests" blocker={edgeTests.summary.beta_blocking_tests_not_passed > 0}>
            <SummaryGrid summary={edgeTests.summary as unknown as Record<string, number>} />
            <div className="mt-4 space-y-2">
              {edgeTests.tests.map((t) => (
                <div key={t.test_code} className="flex items-center justify-between rounded-xl border border-line p-3">
                  <div>
                    <div className="font-semibold text-ink">{t.test_name}</div>
                    <div className="text-xs text-muted">
                      {t.edge_function_name}
                      {t.blocks_beta ? " · blocks beta" : ""}
                      {t.blocks_paid_launch ? " · blocks paid launch" : ""}
                      {t.last_error ? ` · ${t.last_error}` : ""}
                    </div>
                  </div>
                  <StatusPill status={t.test_status} />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              SQL cannot read Edge Function secret values — these tests only pass once the deployed
              functions are actually invoked with the correct headers and success is recorded.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
