"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type {
  AnnouncementStatus,
  AnnouncementType,
  EarlyAccessAnnouncement,
  EarlyAccessCampaign,
} from "@/lib/earlyAccess/types";

const TYPES: AnnouncementType[] = ["general", "release", "maintenance", "known_issue", "urgent"];

function StatusBadge({ status }: { status: AnnouncementStatus }) {
  const style: Record<AnnouncementStatus, string> = {
    draft: "bg-paper text-muted",
    scheduled: "bg-blue-50 text-blue-700",
    published: "bg-emerald-50 text-emerald-700",
    archived: "bg-paper text-muted",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>{status}</span>;
}

function TypeBadge({ type }: { type: AnnouncementType }) {
  const style: Record<AnnouncementType, string> = {
    general: "bg-blue-50 text-blue-700",
    release: "bg-emerald-50 text-emerald-700",
    maintenance: "bg-amber-50 text-amber-700",
    known_issue: "bg-purple-50 text-purple-700",
    urgent: "bg-brick/10 text-brick",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[type]}`}>{type.replaceAll("_", " ")}</span>;
}

type Draft = {
  id?: string;
  title: string;
  body: string;
  announcement_type: AnnouncementType;
  version_label: string;
  scheduled_for: string;
  expires_at: string;
  targetMode: "all" | "selected";
  targetIdsText: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  announcement_type: "general",
  version_label: "",
  scheduled_for: "",
  expires_at: "",
  targetMode: "all",
  targetIdsText: "",
};

export default function AnnouncementsPage() {
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [announcements, setAnnouncements] = useState<EarlyAccessAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<EarlyAccessAnnouncement | null>(null);

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
    const { data, error: annError } = await supabase
      .from("early_access_announcements")
      .select("*")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: false });
    if (annError) {
      setError(friendlyError(annError, "Couldn't load announcements."));
      setLoading(false);
      return;
    }
    setAnnouncements((data as EarlyAccessAnnouncement[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setShowEditor(true);
  }

  function openEdit(a: EarlyAccessAnnouncement) {
    setDraft({
      id: a.id,
      title: a.title,
      body: a.body,
      announcement_type: a.announcement_type,
      version_label: a.version_label ?? "",
      scheduled_for: a.scheduled_for ? a.scheduled_for.slice(0, 16) : "",
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : "",
      targetMode: a.target_workspace_ids && a.target_workspace_ids.length > 0 ? "selected" : "all",
      targetIdsText: (a.target_workspace_ids ?? []).join(", "),
    });
    setShowEditor(true);
  }

  async function saveDraft(nextStatus?: AnnouncementStatus) {
    if (!campaign) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      showError("Title and body are required.");
      return;
    }
    setSaving(true);
    const targetIds =
      draft.targetMode === "selected"
        ? draft.targetIdsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

    const { data: sessionData } = await supabase.auth.getSession();
    const payload = {
      campaign_id: campaign.id,
      title: draft.title.trim(),
      body: draft.body.trim(),
      announcement_type: draft.announcement_type,
      version_label: draft.version_label || null,
      scheduled_for: draft.scheduled_for ? new Date(draft.scheduled_for).toISOString() : null,
      expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
      target_workspace_ids: targetIds,
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextStatus === "published" ? { published_at: new Date().toISOString() } : {}),
    };

    let error;
    let id = draft.id;
    if (draft.id) {
      ({ error } = await supabase.from("early_access_announcements").update(payload).eq("id", draft.id));
    } else {
      const { data, error: insertError } = await supabase
        .from("early_access_announcements")
        .insert({ ...payload, created_by: sessionData.session?.user.id ?? null })
        .select("id")
        .single();
      error = insertError;
      id = data?.id;
    }
    setSaving(false);
    if (error) {
      showError(friendlyError(error, "Couldn't save the announcement."));
      return;
    }
    showSuccess(nextStatus === "published" ? "Announcement published." : "Announcement saved.");
    void logAdminActivity({
      campaignId: campaign.id,
      action: draft.id ? "announcement_updated" : "announcement_created",
      entityType: "early_access_announcement",
      entityId: id ?? null,
      details: { status: nextStatus ?? "draft" },
    });
    setShowEditor(false);
    void load();
  }

  async function archive(a: EarlyAccessAnnouncement) {
    const { error: updateError } = await supabase
      .from("early_access_announcements")
      .update({ status: "archived" })
      .eq("id", a.id);
    setArchiveTarget(null);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't archive that announcement."));
      return;
    }
    showSuccess("Announcement archived.");
    void logAdminActivity({
      campaignId: campaign?.id ?? null,
      action: "announcement_archived",
      entityType: "early_access_announcement",
      entityId: a.id,
    });
    setAnnouncements((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "archived" } : x)));
  }

  if (loading) return <p className="text-muted">Loading announcements…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No Early Access campaign found.</div>;
  }

  return (
    <div>
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> New announcement
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No announcements yet.</div>
      ) : (
        <div className="mt-5 space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.title}</span>
                    <StatusBadge status={a.status} />
                    <TypeBadge type={a.announcement_type} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{a.body}</p>
                  <div className="mt-1 text-xs text-muted">
                    {a.target_workspace_ids && a.target_workspace_ids.length > 0
                      ? `${a.target_workspace_ids.length} selected workspace(s)`
                      : "All Early Access firms"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {a.status !== "archived" && (
                    <button onClick={() => openEdit(a)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                      Edit
                    </button>
                  )}
                  {a.status === "draft" && (
                    <button
                      onClick={() => {
                        openEdit(a);
                      }}
                      className="rounded-lg bg-[#108A64] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Publish…
                    </button>
                  )}
                  {a.status !== "archived" && (
                    <button onClick={() => setArchiveTarget(a)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brick">
                      Archive
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-line bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="font-slab text-lg font-bold text-ink">{draft.id ? "Edit announcement" : "New announcement"}</h3>
              <button onClick={() => setShowEditor(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Body"
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                rows={4}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={draft.announcement_type}
                  onChange={(e) => setDraft((d) => ({ ...d, announcement_type: e.target.value as AnnouncementType }))}
                  className="rounded-sm border border-line px-3 py-2 text-sm capitalize"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Version label (optional)"
                  value={draft.version_label}
                  onChange={(e) => setDraft((d) => ({ ...d, version_label: e.target.value }))}
                  className="rounded-sm border border-line px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted">Schedule for (optional)</label>
                  <input
                    type="datetime-local"
                    value={draft.scheduled_for}
                    onChange={(e) => setDraft((d) => ({ ...d, scheduled_for: e.target.value }))}
                    className="mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted">Expires (optional)</label>
                  <input
                    type="datetime-local"
                    value={draft.expires_at}
                    onChange={(e) => setDraft((d) => ({ ...d, expires_at: e.target.value }))}
                    className="mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted">Audience</label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, targetMode: "all" }))}
                    className={`flex-1 rounded-sm border px-3 py-2 text-xs font-semibold ${draft.targetMode === "all" ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
                  >
                    All Early Access firms
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, targetMode: "selected" }))}
                    className={`flex-1 rounded-sm border px-3 py-2 text-xs font-semibold ${draft.targetMode === "selected" ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
                  >
                    Selected workspaces
                  </button>
                </div>
                {draft.targetMode === "selected" && (
                  <div className="mt-2">
                    <input
                      placeholder="Paste workspace IDs, comma-separated"
                      value={draft.targetIdsText}
                      onChange={(e) => setDraft((d) => ({ ...d, targetIdsText: e.target.value }))}
                      className="w-full rounded-sm border border-line px-3 py-2 text-xs font-mono"
                    />
                    <p className="mt-1 text-xs text-muted">
                      There&apos;s no workspace directory in this admin area yet, so paste full workspace
                      IDs manually (visible in the Agreements/Bugs lists, though currently shortened there).
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => saveDraft("draft")}
                  disabled={saving}
                  className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  Save draft
                </button>
                <button
                  onClick={() => saveDraft(draft.scheduled_for ? "scheduled" : "published")}
                  disabled={saving}
                  className="flex-1 rounded-sm bg-[#108A64] py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {draft.scheduled_for ? "Schedule" : "Publish now"}
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
