"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { EarlyAccessCampaign, EarlyAccessMessageTemplate, MessageTemplateChannel, MessageTemplateStatus } from "@/lib/earlyAccess/types";

const CHANNELS: MessageTemplateChannel[] = ["email", "sms", "in_app"];

function StatusBadge({ status }: { status: MessageTemplateStatus }) {
  const style: Record<MessageTemplateStatus, string> = {
    draft: "bg-paper text-muted",
    active: "bg-emerald-50 text-emerald-700",
    archived: "bg-paper text-muted",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>{status}</span>;
}

type Draft = { id?: string; template_key: string; channel: MessageTemplateChannel; subject: string; body: string };
const EMPTY: Draft = { template_key: "", channel: "email", subject: "", body: "" };

export default function AdminTemplatesPage() {
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [templates, setTemplates] = useState<EarlyAccessMessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

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
    const { data, error: templatesError } = await supabase
      .from("early_access_message_templates")
      .select("*")
      .eq("campaign_id", c.id)
      .order("template_key", { ascending: true });
    if (templatesError) {
      setError(friendlyError(templatesError, "Couldn't load message templates."));
      setLoading(false);
      return;
    }
    setTemplates((data as EarlyAccessMessageTemplate[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setDraft(EMPTY);
    setShowEditor(true);
  }
  function openEdit(t: EarlyAccessMessageTemplate) {
    setDraft({ id: t.id, template_key: t.template_key, channel: t.channel, subject: t.subject ?? "", body: t.body });
    setShowEditor(true);
  }

  async function save(nextStatus?: MessageTemplateStatus) {
    if (!campaign) return;
    if (!draft.template_key.trim() || !draft.body.trim()) {
      showError("Template key and body are required.");
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const payload = {
      campaign_id: campaign.id,
      template_key: draft.template_key.trim(),
      channel: draft.channel,
      subject: draft.channel === "email" ? draft.subject || null : null,
      body: draft.body.trim(),
      ...(nextStatus ? { status: nextStatus } : {}),
    };
    let error;
    let id = draft.id;
    if (draft.id) {
      ({ error } = await supabase.from("early_access_message_templates").update(payload).eq("id", draft.id));
    } else {
      const { data, error: insertError } = await supabase
        .from("early_access_message_templates")
        .insert({ ...payload, created_by: sessionData.session?.user.id ?? null })
        .select("id")
        .single();
      error = insertError;
      id = data?.id;
    }
    setSaving(false);
    if (error) {
      showError(friendlyError(error, "Couldn't save that template. The key/channel combination may already exist."));
      return;
    }
    showSuccess(nextStatus === "active" ? "Template activated." : "Template saved.");
    void logAdminActivity({
      campaignId: campaign.id,
      action: draft.id ? "message_template_updated" : "message_template_created",
      entityType: "early_access_message_template",
      entityId: id ?? null,
      details: { status: nextStatus ?? "draft" },
    });
    setShowEditor(false);
    void load();
  }

  async function archive(t: EarlyAccessMessageTemplate) {
    const { error: updateError } = await supabase.from("early_access_message_templates").update({ status: "archived" }).eq("id", t.id);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't archive that template."));
      return;
    }
    showSuccess("Template archived.");
    void logAdminActivity({ campaignId: campaign?.id ?? null, action: "message_template_archived", entityType: "early_access_message_template", entityId: t.id });
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: "archived" } : x)));
  }

  if (loading) return <p className="text-muted">Loading templates…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) return <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No Early Access campaign found.</div>;

  return (
    <div>
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> New template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No message templates yet.</div>
      ) : (
        <div className="mt-5 space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">{t.template_key}</span>
                    <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold uppercase text-muted">{t.channel}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.subject && <div className="mt-1 text-sm text-ink">{t.subject}</div>}
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted">{t.body}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => openEdit(t)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                    Edit
                  </button>
                  {t.status === "draft" && (
                    <button onClick={() => { setDraft({ id: t.id, template_key: t.template_key, channel: t.channel, subject: t.subject ?? "", body: t.body }); void save("active"); }} className="rounded-lg bg-[#108A64] px-3 py-1.5 text-xs font-semibold text-white">
                      Activate
                    </button>
                  )}
                  {t.status !== "archived" && (
                    <button onClick={() => archive(t)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brick">
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
              <h3 className="font-slab text-lg font-bold text-ink">{draft.id ? "Edit template" : "New template"}</h3>
              <button onClick={() => setShowEditor(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Template key (e.g. beta_invitation)"
                value={draft.template_key}
                onChange={(e) => setDraft((d) => ({ ...d, template_key: e.target.value }))}
                disabled={!!draft.id}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm font-mono disabled:bg-paper"
              />
              <select
                value={draft.channel}
                onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value as MessageTemplateChannel }))}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm uppercase"
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {draft.channel === "email" && (
                <input
                  placeholder="Subject"
                  value={draft.subject}
                  onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                  className="w-full rounded-sm border border-line px-3 py-2 text-sm"
                />
              )}
              <textarea
                placeholder="Body — use {{merge_field}} for dynamic values (e.g. {{owner_name}}, {{invitation_url}}, {{expires_at}})"
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                rows={8}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <div className="flex gap-2 pt-2">
                <button onClick={() => save()} disabled={saving} className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink disabled:opacity-60">
                  Save draft
                </button>
                <button onClick={() => save("active")} disabled={saving} className="flex-1 rounded-sm bg-[#108A64] py-2 text-sm font-semibold text-white disabled:opacity-60">
                  Save &amp; activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
