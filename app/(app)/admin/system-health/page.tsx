"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Shield, AlertTriangle, RefreshCw } from "lucide-react";
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

function StatusPill({ status }: { status: string | null }) {
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

export default function SystemHealthPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReadinessRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data: ok } = await supabase.rpc("is_platform_admin");
    setAllowed(ok === true);
    if (ok === true) {
      const { data, error: rpcError } = await supabase.rpc("admin_launch_readiness_dashboard");
      if (rpcError) {
        setError(friendlyError(rpcError, "Couldn't load system health data."));
      } else {
        const list = (data as ReadinessRow[]) ?? [];
        setRows(list);
        setGeneratedAt(list[0]?.generated_at ?? null);
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
            Beta-launch readiness by category, driven by the platform launch checklist. Hidden
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
          Generated {new Date(generatedAt).toLocaleString()}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No launch-readiness categories are configured yet.
        </div>
      )}

      {blockedCategories.length > 0 && (
        <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={14} /> {blockedCategories.length} categor
            {blockedCategories.length === 1 ? "y is" : "ies are"} blocked with more than 3 open
            required items.
          </span>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {rows.map((r, i) => (
          <div key={r.category ?? i} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{r.category || "Readiness area"}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">
                  {r.completed_items ?? 0}/{r.total_items ?? 0}
                </span>
                <StatusPill status={r.testing_status} />
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
                {r.required_open_items} required item{r.required_open_items === 1 ? "" : "s"} still open
                before beta testing.
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
    </div>
  );
}
