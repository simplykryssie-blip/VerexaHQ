"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { friendlyError } from "@/lib/friendlyError";
import ApplicationForm from "@/components/earlyAccess/ApplicationForm";
import type { EarlyAccessCampaign, EarlyAccessSettings } from "@/lib/earlyAccess/types";

export default function ApplyPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [settings, setSettings] = useState<EarlyAccessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // early_access_campaigns_member_read only returns rows once the campaign
    // is accepting_applications/invite_only/active/completed -- while it's
    // draft (as it is now, per "do not activate the campaign or open
    // applications automatically"), this legitimately returns nothing.
    const { data: campaignRow, error: campaignError } = await supabase
      .from("early_access_campaigns")
      .select("*")
      .eq("slug", "verexahq-v0-2-founding-firm-beta")
      .maybeSingle();
    if (campaignError) {
      setError(friendlyError(campaignError, "Couldn't load the application form."));
      setLoading(false);
      return;
    }
    setCampaign(campaignRow as EarlyAccessCampaign | null);
    if (campaignRow) {
      const { data: settingsRow } = await supabase
        .from("early_access_settings")
        .select("*")
        .eq("campaign_id", campaignRow.id)
        .maybeSingle();
      setSettings(settingsRow as EarlyAccessSettings | null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;

  if (submitted) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <CheckCircle2 size={40} className="mx-auto text-green" />
        <h1 className="mt-3 text-lg font-bold text-ink">Application submitted</h1>
        <p className="mt-2 text-sm text-muted">
          Thanks for applying. We&apos;ll follow up by email if your firm is selected.
        </p>
      </div>
    );
  }

  if (!campaign || !settings || !settings.allow_applications) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Applications aren&apos;t open right now.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-ink">Apply to {campaign.name}</h1>
      <p className="mt-1 text-sm text-muted">{campaign.description}</p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-6">
        <ApplicationForm
          campaign={campaign}
          workspaceId={activeWorkspaceId}
          questions={settings.application_questions}
          onSubmitted={() => setSubmitted(true)}
        />
      </div>
    </div>
  );
}
