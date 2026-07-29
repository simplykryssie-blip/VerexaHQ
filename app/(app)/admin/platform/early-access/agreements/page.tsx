"use client";
import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { EarlyAccessAgreement, EarlyAccessCampaign } from "@/lib/earlyAccess/types";

function shortId(id: string) {
  return id.slice(0, 8);
}

export default function AgreementsPage() {
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [agreements, setAgreements] = useState<EarlyAccessAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [versionDraft, setVersionDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
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
    setVersionDraft(c.agreement_version ?? "");
    setContentDraft(c.agreement_content ?? "");

    const { data, error: agreementsError } = await supabase
      .from("early_access_agreements")
      .select("*")
      .eq("campaign_id", c.id)
      .order("accepted_at", { ascending: false });
    if (agreementsError) {
      setError(friendlyError(agreementsError, "Couldn't load agreement acceptance records."));
      setLoading(false);
      return;
    }
    setAgreements((data as EarlyAccessAgreement[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAgreement() {
    if (!campaign) return;
    setSaving(true);
    const { error: updateError } = await supabase
      .from("early_access_campaigns")
      .update({ agreement_version: versionDraft, agreement_content: contentDraft })
      .eq("id", campaign.id);
    setSaving(false);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't save the agreement."));
      return;
    }
    showSuccess("Agreement version saved.");
    void logAdminActivity({
      campaignId: campaign.id,
      action: "agreement_version_updated",
      entityType: "early_access_campaign",
      entityId: campaign.id,
      details: { agreement_version: versionDraft },
    });
    setCampaign((prev) => (prev ? { ...prev, agreement_version: versionDraft, agreement_content: contentDraft } : prev));
  }

  if (loading) return <p className="text-muted">Loading agreements…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        No Early Access campaign found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">Agreement version</h2>
        <p className="mt-1 text-sm text-muted">
          Editing this only changes what future acceptances record — accepted agreement
          snapshots below are immutable and never edited from this page.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Version label</label>
            <input
              value={versionDraft}
              onChange={(e) => setVersionDraft(e.target.value)}
              placeholder="e.g. v1.0"
              className="mt-1 w-full max-w-xs rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Agreement content</label>
            <textarea
              value={contentDraft}
              onChange={(e) => setContentDraft(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-mono text-xs"
              placeholder="Full agreement text shown to firms before they accept…"
            />
          </div>
          <button
            onClick={saveAgreement}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save size={14} /> {saving ? "Saving…" : "Save agreement"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">Acceptance records</h2>
        <p className="mt-1 text-sm text-muted">
          {agreements.length} acceptance{agreements.length === 1 ? "" : "s"} recorded. Workspace and
          user names aren&apos;t resolvable from this admin view yet — see the completion report for
          the exact backend change needed.
        </p>
        {agreements.length === 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-paper p-6 text-center text-sm text-muted">
            No agreements accepted yet.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Workspace</th>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Accepted</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4">Browser</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{shortId(a.workspace_id)}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{shortId(a.user_id)}</td>
                    <td className="py-2 pr-4 text-muted">{a.agreement_version}</td>
                    <td className="py-2 pr-4 text-muted">{new Date(a.accepted_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-muted">{a.ip_address ?? "—"}</td>
                    <td className="max-w-[220px] truncate py-2 pr-4 text-muted" title={a.user_agent ?? undefined}>
                      {a.user_agent ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
