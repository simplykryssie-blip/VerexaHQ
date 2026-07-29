"use client";
import { useCallback, useEffect, useState } from "react";
import { Bug as BugIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { friendlyError } from "@/lib/friendlyError";
import ReportBugModal from "@/components/earlyAccess/ReportBugModal";
import type { BugSeverity, BugStatus, EarlyAccessBugReport } from "@/lib/earlyAccess/types";

const STATUS_STYLE: Record<BugStatus, string> = {
  new: "bg-blue-50 text-blue-700",
  confirmed: "bg-purple-50 text-purple-700",
  assigned: "bg-amber-50 text-amber-700",
  in_progress: "bg-amber-50 text-amber-700",
  fixed: "bg-emerald-50 text-emerald-700",
  released: "bg-emerald-50 text-emerald-700",
  closed: "bg-paper text-muted",
  duplicate: "bg-paper text-muted",
  cannot_reproduce: "bg-paper text-muted",
};
const SEVERITY_STYLE: Record<BugSeverity, string> = {
  critical: "bg-brick/10 text-brick",
  high: "bg-amber-50 text-amber-700",
  medium: "bg-blue-50 text-blue-700",
  low: "bg-paper text-muted",
};

export default function WorkspaceBugsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading: membershipLoading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const [bugs, setBugs] = useState<EarlyAccessBugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    const { data, error: bugsError } = await supabase
      .from("early_access_bug_reports")
      .select("*")
      .eq("workspace_id", activeWorkspaceId)
      .order("created_at", { ascending: false });
    if (bugsError) {
      setError(friendlyError(bugsError, "Couldn't load your bug reports."));
      setLoading(false);
      return;
    }
    setBugs((data as EarlyAccessBugReport[]) ?? []);
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (membershipLoading || loading) return <p className="text-muted">Loading…</p>;
  if (!inProgram) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Bug reporting is available once your workspace has joined an Early Access program.
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Bug reports</h1>
          <p className="mt-1 text-sm text-muted">Things your team has reported for this workspace.</p>
        </div>
        <button
          onClick={() => setShowReport(true)}
          className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white"
        >
          <BugIcon size={15} /> Report a bug
        </button>
      </div>

      {bugs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No bug reports yet.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {bugs.map((b) => (
            <div key={b.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{b.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLE[b.severity]}`}>{b.severity}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[b.status]}`}>{b.status.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-1.5 text-sm text-muted">{b.description}</p>
              {b.resolution_notes && (
                <p className="mt-2 rounded-lg bg-paper p-2 text-xs text-ink">
                  <span className="font-semibold">Update: </span>
                  {b.resolution_notes}
                  {b.fixed_in_version ? ` (${b.fixed_in_version})` : ""}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">{new Date(b.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {showReport && activeWorkspaceId && (
        <ReportBugModal
          workspaceId={activeWorkspaceId}
          campaignId={campaign?.id ?? null}
          appVersion={campaign?.version_label ?? null}
          onClose={() => {
            setShowReport(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
