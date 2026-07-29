"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type {
  BugSeverity,
  BugStatus,
  EarlyAccessBugComment,
  EarlyAccessBugReport,
  EarlyAccessCampaign,
} from "@/lib/earlyAccess/types";

const STATUSES: BugStatus[] = [
  "new",
  "confirmed",
  "assigned",
  "in_progress",
  "fixed",
  "released",
  "closed",
  "duplicate",
  "cannot_reproduce",
];
const SEVERITIES: BugSeverity[] = ["critical", "high", "medium", "low"];

function shortId(id: string) {
  return id.slice(0, 8);
}

function SeverityBadge({ severity }: { severity: BugSeverity }) {
  const style: Record<BugSeverity, string> = {
    critical: "bg-brick/10 text-brick",
    high: "bg-amber-50 text-amber-700",
    medium: "bg-blue-50 text-blue-700",
    low: "bg-paper text-muted",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[severity]}`}>{severity}</span>;
}

function StatusBadge({ status }: { status: BugStatus }) {
  const style: Record<BugStatus, string> = {
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
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function BugsPageInner() {
  const searchParams = useSearchParams();
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [bugs, setBugs] = useState<EarlyAccessBugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>(searchParams.get("severity") ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<EarlyAccessBugReport | null>(null);
  const [comments, setComments] = useState<EarlyAccessBugComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [fixedVersionDraft, setFixedVersionDraft] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: campaignRow, error: campaignError } = await supabase
      .from("early_access_campaigns")
      .select("*")
      .eq("slug", "verexahq-v0-2-founding-firm-beta")
      .maybeSingle();
    if (campaignError || !campaignRow) {
      setError(friendlyError(campaignError, "Couldn't load the Early Access campaign."));
      setLoading(false);
      return;
    }
    const c = campaignRow as EarlyAccessCampaign;
    setCampaign(c);
    const { data, error: bugsError } = await supabase
      .from("early_access_bug_reports")
      .select("*")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: false });
    if (bugsError) {
      setError(friendlyError(bugsError, "Couldn't load bug reports."));
      setLoading(false);
      return;
    }
    setBugs((data as EarlyAccessBugReport[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return bugs.filter((b) => {
      if (severityFilter !== "all" && b.severity !== severityFilter) return false;
      if (statusFilter === "open") {
        return !["closed", "duplicate", "cannot_reproduce"].includes(b.status);
      }
      if (statusFilter === "all") return true;
      return b.status === statusFilter;
    });
  }, [bugs, severityFilter, statusFilter]);

  async function openDetail(bug: EarlyAccessBugReport) {
    setSelected(bug);
    setResolutionDraft(bug.resolution_notes ?? "");
    setFixedVersionDraft(bug.fixed_in_version ?? "");
    const { data } = await supabase
      .from("early_access_bug_comments")
      .select("*")
      .eq("bug_report_id", bug.id)
      .order("created_at", { ascending: true });
    setComments((data as EarlyAccessBugComment[]) ?? []);
  }

  async function changeStatus(nextStatus: BugStatus) {
    if (!selected || !campaign) return;
    setStatusBusy(true);
    const patch: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "closed" || nextStatus === "duplicate" || nextStatus === "cannot_reproduce") {
      patch.closed_at = new Date().toISOString();
    } else {
      patch.closed_at = null;
    }
    const { error: updateError } = await supabase.from("early_access_bug_reports").update(patch).eq("id", selected.id);
    setStatusBusy(false);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't update the bug status."));
      return;
    }
    showSuccess(`Bug marked ${nextStatus.replaceAll("_", " ")}.`);
    void logAdminActivity({
      campaignId: campaign.id,
      workspaceId: selected.workspace_id,
      action: "bug_status_changed",
      entityType: "early_access_bug_report",
      entityId: selected.id,
      details: { from: selected.status, to: nextStatus },
    });
    setBugs((prev) => prev.map((b) => (b.id === selected.id ? { ...b, status: nextStatus } : b)));
    setSelected((prev) => (prev ? { ...prev, status: nextStatus } : prev));
  }

  async function saveResolution() {
    if (!selected) return;
    const { error: updateError } = await supabase
      .from("early_access_bug_reports")
      .update({ resolution_notes: resolutionDraft, fixed_in_version: fixedVersionDraft || null })
      .eq("id", selected.id);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't save resolution notes."));
      return;
    }
    showSuccess("Resolution notes saved.");
    setBugs((prev) =>
      prev.map((b) =>
        b.id === selected.id ? { ...b, resolution_notes: resolutionDraft, fixed_in_version: fixedVersionDraft || null } : b,
      ),
    );
  }

  async function postComment() {
    if (!selected || !newComment.trim()) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data, error: insertError } = await supabase
      .from("early_access_bug_comments")
      .insert({ bug_report_id: selected.id, author_id: userId, body: newComment.trim(), is_internal: true })
      .select("*")
      .single();
    if (insertError || !data) {
      showError(friendlyError(insertError, "Couldn't post that comment."));
      return;
    }
    setComments((prev) => [...prev, data as EarlyAccessBugComment]);
    setNewComment("");
  }

  if (loading) return <p className="text-muted">Loading bug reports…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        No Early Access campaign found.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-line px-3 py-2 text-sm">
          <option value="open">Open (not closed/duplicate/cannot reproduce)</option>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="rounded-xl border border-line px-3 py-2 text-sm capitalize">
          <option value="all">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No bug reports match this filter.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reported</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} onClick={() => openDetail(b)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-4 py-3 font-semibold text-ink">{b.title}</td>
                  <td className="px-4 py-3 text-muted">{b.module ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{shortId(b.workspace_id)}</td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={b.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/30">
          <button aria-label="Close" className="absolute inset-0" onClick={() => setSelected(null)} tabIndex={-1} />
          <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">{selected.title}</h2>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <SeverityBadge severity={selected.severity} />
              <StatusBadge status={selected.status} />
            </div>

            <p className="mt-4 text-sm text-ink">{selected.description}</p>
            {selected.expected_behavior && (
              <div className="mt-3">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Expected</div>
                <p className="text-sm text-ink">{selected.expected_behavior}</p>
              </div>
            )}
            {selected.actual_behavior && (
              <div className="mt-3">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Actual</div>
                <p className="text-sm text-ink">{selected.actual_behavior}</p>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-3 text-xs">
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">Module</div>
                <div className="mt-0.5 text-ink">{selected.module ?? "—"}</div>
              </div>
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">App version</div>
                <div className="mt-0.5 text-ink">{selected.app_version ?? "—"}</div>
              </div>
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">Workspace</div>
                <div className="mt-0.5 font-mono text-ink">{shortId(selected.workspace_id)}</div>
              </div>
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">Reported by</div>
                <div className="mt-0.5 font-mono text-ink">{shortId(selected.reported_by)}</div>
              </div>
              <div className="col-span-2 truncate">
                <div className="font-bold uppercase tracking-wide text-muted">Page URL</div>
                <div className="mt-0.5 text-ink">{selected.page_url ?? "—"}</div>
              </div>
              <div className="col-span-2 truncate" title={selected.browser_info ?? undefined}>
                <div className="font-bold uppercase tracking-wide text-muted">Browser</div>
                <div className="mt-0.5 text-ink">{selected.browser_info ?? "—"}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={statusBusy || selected.status === s}
                  onClick={() => changeStatus(s)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize disabled:opacity-40 ${
                    selected.status === s ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"
                  }`}
                >
                  {s.replaceAll("_", " ")}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-muted">Fixed in version</label>
              <input
                value={fixedVersionDraft}
                onChange={(e) => setFixedVersionDraft(e.target.value)}
                placeholder="e.g. v0.2.1"
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
              <label className="text-xs font-bold uppercase tracking-wide text-muted">Resolution notes</label>
              <textarea
                value={resolutionDraft}
                onChange={(e) => setResolutionDraft(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
              <button onClick={saveResolution} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                Save
              </button>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Internal comments</div>
              <div className="mt-2 space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-paper p-2.5 text-sm text-ink">
                    <div className="text-xs text-muted">{new Date(c.created_at).toLocaleString()}</div>
                    {c.body}
                  </div>
                ))}
                {comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add an internal comment…"
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
                />
                <button onClick={postComment} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BugsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading bug reports…</p>}>
      <BugsPageInner />
    </Suspense>
  );
}
