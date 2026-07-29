"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, ThumbsUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { EarlyAccessCampaign, EarlyAccessFeatureRequest, FeaturePriority, FeatureRequestStatus } from "@/lib/earlyAccess/types";

const STATUSES: FeatureRequestStatus[] = ["under_review", "planned", "in_progress", "completed", "declined", "duplicate"];
const PRIORITIES: FeaturePriority[] = ["critical", "high", "medium", "low"];

function shortId(id: string) {
  return id.slice(0, 8);
}

function StatusBadge({ status }: { status: FeatureRequestStatus }) {
  const style: Record<FeatureRequestStatus, string> = {
    under_review: "bg-blue-50 text-blue-700",
    planned: "bg-purple-50 text-purple-700",
    in_progress: "bg-amber-50 text-amber-700",
    completed: "bg-emerald-50 text-emerald-700",
    declined: "bg-brick/10 text-brick",
    duplicate: "bg-paper text-muted",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>{status.replaceAll("_", " ")}</span>;
}

export default function AdminFeaturesPage() {
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [requests, setRequests] = useState<EarlyAccessFeatureRequest[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<EarlyAccessFeatureRequest | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState<FeaturePriority | "">("");
  const [plannedVersionDraft, setPlannedVersionDraft] = useState("");

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
    const { data, error: reqError } = await supabase
      .from("early_access_feature_requests")
      .select("*")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: false });
    if (reqError) {
      setError(friendlyError(reqError, "Couldn't load feature requests."));
      setLoading(false);
      return;
    }
    const list = (data as EarlyAccessFeatureRequest[]) ?? [];
    setRequests(list);

    if (list.length > 0) {
      const { data: votes } = await supabase
        .from("early_access_feature_votes")
        .select("feature_request_id")
        .in("feature_request_id", list.map((r) => r.id));
      const counts: Record<string, number> = {};
      for (const v of (votes as { feature_request_id: string }[] | null) ?? []) {
        counts[v.feature_request_id] = (counts[v.feature_request_id] ?? 0) + 1;
      }
      setVoteCounts(counts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => requests.filter((r) => statusFilter === "all" || r.status === statusFilter),
    [requests, statusFilter],
  );

  function openDetail(r: EarlyAccessFeatureRequest) {
    setSelected(r);
    setNotesDraft(r.admin_notes ?? "");
    setPriorityDraft(r.priority ?? "");
    setPlannedVersionDraft(r.planned_version ?? "");
  }

  async function changeStatus(nextStatus: FeatureRequestStatus) {
    if (!selected || !campaign) return;
    const { error: updateError } = await supabase
      .from("early_access_feature_requests")
      .update({ status: nextStatus })
      .eq("id", selected.id);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't update the status."));
      return;
    }
    showSuccess(`Marked ${nextStatus.replaceAll("_", " ")}.`);
    void logAdminActivity({
      campaignId: campaign.id,
      workspaceId: selected.workspace_id,
      action: "feature_request_status_changed",
      entityType: "early_access_feature_request",
      entityId: selected.id,
      details: { from: selected.status, to: nextStatus },
    });
    setRequests((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status: nextStatus } : r)));
    setSelected((prev) => (prev ? { ...prev, status: nextStatus } : prev));
  }

  async function saveDetails() {
    if (!selected) return;
    const { error: updateError } = await supabase
      .from("early_access_feature_requests")
      .update({
        admin_notes: notesDraft || null,
        priority: priorityDraft || null,
        planned_version: plannedVersionDraft || null,
      })
      .eq("id", selected.id);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't save changes."));
      return;
    }
    showSuccess("Saved.");
    setRequests((prev) =>
      prev.map((r) =>
        r.id === selected.id
          ? { ...r, admin_notes: notesDraft || null, priority: (priorityDraft || null) as FeaturePriority | null, planned_version: plannedVersionDraft || null }
          : r,
      ),
    );
  }

  if (loading) return <p className="text-muted">Loading feature requests…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No Early Access campaign found.</div>;
  }

  return (
    <div>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-line px-3 py-2 text-sm">
        <option value="all">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No feature requests match this filter.</div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Votes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => openDetail(r)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-4 py-3 font-semibold text-ink">{r.title}</td>
                  <td className="px-4 py-3 text-muted">{r.category ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp size={12} /> {voteCounts[r.id] ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
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
            <div className="mt-2">
              <StatusBadge status={selected.status} />
            </div>
            <p className="mt-4 text-sm text-ink">{selected.description}</p>
            {selected.business_value && (
              <div className="mt-3">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Business value</div>
                <p className="text-sm text-ink">{selected.business_value}</p>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">Frequency</div>
                <div className="mt-0.5 text-ink">{selected.frequency ?? "—"}</div>
              </div>
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">Category</div>
                <div className="mt-0.5 text-ink">{selected.category ?? "—"}</div>
              </div>
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">Votes</div>
                <div className="mt-0.5 text-ink">{voteCounts[selected.id] ?? 0}</div>
              </div>
              <div>
                <div className="font-bold uppercase tracking-wide text-muted">Workspace</div>
                <div className="mt-0.5 font-mono text-ink">{shortId(selected.workspace_id)}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={selected.status === s}
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
              <label className="text-xs font-bold uppercase tracking-wide text-muted">Priority</label>
              <select
                value={priorityDraft}
                onChange={(e) => setPriorityDraft(e.target.value as FeaturePriority | "")}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm capitalize"
              >
                <option value="">Not set</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <label className="text-xs font-bold uppercase tracking-wide text-muted">Planned version</label>
              <input
                value={plannedVersionDraft}
                onChange={(e) => setPlannedVersionDraft(e.target.value)}
                placeholder="e.g. v0.3"
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
              <label className="text-xs font-bold uppercase tracking-wide text-muted">Admin notes</label>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
              <button onClick={saveDetails} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
