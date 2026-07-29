"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { EarlyAccessCampaign, EarlyAccessResource, ResourceStatus, ResourceType } from "@/lib/earlyAccess/types";

const TYPES: ResourceType[] = ["guide", "policy", "faq", "checklist", "known_issues", "support"];

function StatusBadge({ status }: { status: ResourceStatus }) {
  const style: Record<ResourceStatus, string> = {
    draft: "bg-paper text-muted",
    published: "bg-emerald-50 text-emerald-700",
    archived: "bg-paper text-muted",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>{status}</span>;
}

type Draft = { id?: string; resource_key: string; title: string; content: string; resource_type: ResourceType; sort_order: number };
const EMPTY: Draft = { resource_key: "", title: "", content: "", resource_type: "guide", sort_order: 0 };

export default function AdminResourcesPage() {
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [resources, setResources] = useState<EarlyAccessResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<EarlyAccessResource | null>(null);

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
    const { data, error: resourcesError } = await supabase
      .from("early_access_resources")
      .select("*")
      .eq("campaign_id", c.id)
      .order("sort_order", { ascending: true });
    if (resourcesError) {
      setError(friendlyError(resourcesError, "Couldn't load resources."));
      setLoading(false);
      return;
    }
    setResources((data as EarlyAccessResource[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setDraft({ ...EMPTY, sort_order: (Math.max(0, ...resources.map((r) => r.sort_order)) || 0) + 10 });
    setShowEditor(true);
  }
  function openEdit(r: EarlyAccessResource) {
    setDraft({ id: r.id, resource_key: r.resource_key, title: r.title, content: r.content, resource_type: r.resource_type, sort_order: r.sort_order });
    setShowEditor(true);
  }

  async function save(nextStatus?: ResourceStatus) {
    if (!campaign) return;
    if (!draft.resource_key.trim() || !draft.title.trim() || !draft.content.trim()) {
      showError("Key, title, and content are required.");
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const payload = {
      campaign_id: campaign.id,
      resource_key: draft.resource_key.trim(),
      title: draft.title.trim(),
      content: draft.content.trim(),
      resource_type: draft.resource_type,
      sort_order: draft.sort_order,
      ...(nextStatus ? { status: nextStatus } : {}),
    };
    let error;
    let id = draft.id;
    if (draft.id) {
      ({ error } = await supabase.from("early_access_resources").update(payload).eq("id", draft.id));
    } else {
      const { data, error: insertError } = await supabase
        .from("early_access_resources")
        .insert({ ...payload, created_by: sessionData.session?.user.id ?? null })
        .select("id")
        .single();
      error = insertError;
      id = data?.id;
    }
    setSaving(false);
    if (error) {
      showError(friendlyError(error, "Couldn't save that resource. The key may already be in use."));
      return;
    }
    showSuccess(nextStatus === "published" ? "Resource published." : "Resource saved.");
    void logAdminActivity({
      campaignId: campaign.id,
      action: draft.id ? "resource_updated" : "resource_created",
      entityType: "early_access_resource",
      entityId: id ?? null,
      details: { status: nextStatus ?? "draft" },
    });
    setShowEditor(false);
    void load();
  }

  async function archive(r: EarlyAccessResource) {
    const { error: updateError } = await supabase.from("early_access_resources").update({ status: "archived" }).eq("id", r.id);
    setArchiveTarget(null);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't archive that resource."));
      return;
    }
    showSuccess("Resource archived.");
    void logAdminActivity({ campaignId: campaign?.id ?? null, action: "resource_archived", entityType: "early_access_resource", entityId: r.id });
    setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "archived" } : x)));
  }

  async function reorder(r: EarlyAccessResource, dir: -1 | 1) {
    const sorted = [...resources].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((x) => x.id === r.id);
    const target = sorted[index + dir];
    if (!target) return;
    const { error: e1 } = await supabase.from("early_access_resources").update({ sort_order: target.sort_order }).eq("id", r.id);
    const { error: e2 } = await supabase.from("early_access_resources").update({ sort_order: r.sort_order }).eq("id", target.id);
    if (e1 || e2) {
      showError("Couldn't reorder resources.");
      return;
    }
    void load();
  }

  if (loading) return <p className="text-muted">Loading resources…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) return <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No Early Access campaign found.</div>;

  return (
    <div>
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> New resource
        </button>
      </div>

      {resources.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No resources yet.</div>
      ) : (
        <div className="mt-5 space-y-2">
          {resources
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{r.title}</span>
                    <StatusBadge status={r.status} />
                    <span className="text-xs capitalize text-muted">{r.resource_type.replaceAll("_", " ")}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted">{r.resource_key}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => reorder(r, -1)} className="rounded-lg border border-line p-1.5 text-ink">
                    <ArrowUp size={13} />
                  </button>
                  <button onClick={() => reorder(r, 1)} className="rounded-lg border border-line p-1.5 text-ink">
                    <ArrowDown size={13} />
                  </button>
                  <button onClick={() => openEdit(r)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                    Edit
                  </button>
                  {r.status === "draft" && (
                    <button
                      onClick={() => {
                        openEdit(r);
                      }}
                      className="rounded-lg bg-[#108A64] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Publish…
                    </button>
                  )}
                  {r.status !== "archived" && (
                    <button onClick={() => setArchiveTarget(r)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brick">
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-line bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="font-slab text-lg font-bold text-ink">{draft.id ? "Edit resource" : "New resource"}</h3>
              <button onClick={() => setShowEditor(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Resource key (unique, e.g. getting_started)"
                value={draft.resource_key}
                onChange={(e) => setDraft((d) => ({ ...d, resource_key: e.target.value }))}
                disabled={!!draft.id}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm disabled:bg-paper"
              />
              <input
                placeholder="Title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <select
                value={draft.resource_type}
                onChange={(e) => setDraft((d) => ({ ...d, resource_type: e.target.value as ResourceType }))}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm capitalize"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="Content"
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                rows={8}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <div className="flex gap-2 pt-2">
                <button onClick={() => save()} disabled={saving} className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink disabled:opacity-60">
                  Save draft
                </button>
                <button onClick={() => save("published")} disabled={saving} className="flex-1 rounded-sm bg-[#108A64] py-2 text-sm font-semibold text-white disabled:opacity-60">
                  Publish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <ConfirmDialog
          open
          title={`Archive "${archiveTarget.title}"?`}
          description="It will no longer be visible to firms."
          destructive
          confirmLabel="Archive"
          onConfirm={() => archive(archiveTarget)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}
