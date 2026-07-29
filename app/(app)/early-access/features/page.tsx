"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, ThumbsUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import type { EarlyAccessFeatureRequest, FeatureRequestStatus } from "@/lib/earlyAccess/types";

const STATUS_STYLE: Record<FeatureRequestStatus, string> = {
  under_review: "bg-blue-50 text-blue-700",
  planned: "bg-purple-50 text-purple-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  declined: "bg-brick/10 text-brick",
  duplicate: "bg-paper text-muted",
};

export default function WorkspaceFeaturesPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading: membershipLoading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const { showSuccess, showError } = useToast();
  const [requests, setRequests] = useState<EarlyAccessFeatureRequest[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [businessValue, setBusinessValue] = useState("");
  const [frequency, setFrequency] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId || !campaign) return;
    setLoading(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { data, error: reqError } = await supabase
      .from("early_access_feature_requests")
      .select("*")
      .eq("campaign_id", campaign.id)
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
        .select("feature_request_id, user_id")
        .in("feature_request_id", list.map((r) => r.id));
      const counts: Record<string, number> = {};
      const mine = new Set<string>();
      for (const v of (votes as { feature_request_id: string; user_id: string }[] | null) ?? []) {
        counts[v.feature_request_id] = (counts[v.feature_request_id] ?? 0) + 1;
        if (v.user_id === userId) mine.add(v.feature_request_id);
      }
      setVoteCounts(counts);
      setMyVotes(mine);
    }
    setLoading(false);
  }, [activeWorkspaceId, campaign]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleVote(request: EarlyAccessFeatureRequest) {
    if (!activeWorkspaceId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;

    if (myVotes.has(request.id)) {
      const { error: deleteError } = await supabase
        .from("early_access_feature_votes")
        .delete()
        .eq("feature_request_id", request.id)
        .eq("user_id", userId);
      if (deleteError) {
        showError(friendlyError(deleteError, "Couldn't remove your vote."));
        return;
      }
      setMyVotes((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
      setVoteCounts((prev) => ({ ...prev, [request.id]: Math.max(0, (prev[request.id] ?? 1) - 1) }));
    } else {
      const { error: insertError } = await supabase
        .from("early_access_feature_votes")
        .insert({ feature_request_id: request.id, workspace_id: activeWorkspaceId, user_id: userId });
      if (insertError) {
        showError(friendlyError(insertError, "Couldn't record your vote."));
        return;
      }
      setMyVotes((prev) => new Set(prev).add(request.id));
      setVoteCounts((prev) => ({ ...prev, [request.id]: (prev[request.id] ?? 0) + 1 }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !campaign) return;
    setSubmitting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setSubmitting(false);
      showError("Your session expired. Please sign in again.");
      return;
    }
    const { error: insertError } = await supabase.from("early_access_feature_requests").insert({
      campaign_id: campaign.id,
      workspace_id: activeWorkspaceId,
      requested_by: userId,
      title,
      description,
      business_value: businessValue || null,
      frequency: frequency || null,
      category: category || null,
    });
    setSubmitting(false);
    if (insertError) {
      showError(friendlyError(insertError, "Couldn't submit your request."));
      return;
    }
    showSuccess("Feature request submitted.");
    setTitle("");
    setDescription("");
    setBusinessValue("");
    setFrequency("");
    setCategory("");
    setShowForm(false);
    void load();
  }

  if (membershipLoading || loading) return <p className="text-muted">Loading…</p>;
  if (!inProgram || !campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Feature requests are available once your workspace has joined an Early Access program.
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Feature requests</h1>
          <p className="mt-1 text-sm text-muted">Suggest ideas and vote on what matters most to your firm.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white"
        >
          <Plus size={15} /> New request
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No feature requests yet. Be the first to suggest one.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="flex items-start gap-4 rounded-2xl border border-line bg-white p-4">
              <button
                onClick={() => toggleVote(r)}
                className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-bold ${
                  myVotes.has(r.id) ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-muted"
                }`}
              >
                <ThumbsUp size={15} />
                {voteCounts[r.id] ?? 0}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{r.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[r.status]}`}>
                    {r.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{r.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-sm border border-line bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="font-slab text-lg font-bold text-ink">New feature request</h3>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                required
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <textarea
                required
                placeholder="Describe what you'd like to see"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Why would this help your firm? (optional)"
                value={businessValue}
                onChange={(e) => setBusinessValue(e.target.value)}
                rows={2}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="How often would you use this?"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="rounded-sm border border-line px-3 py-2 text-sm"
                />
                <input
                  placeholder="Category (optional)"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-sm border border-line px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 rounded-sm bg-ink py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
