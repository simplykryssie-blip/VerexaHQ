"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  CheckCircle2,
  ListPlus,
  Building2,
  Send,
  UserCheck,
  FileCheck,
  Bug,
  AlertOctagon,
  Lightbulb,
  ThumbsUp,
  ClipboardList,
  Smile,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import type { EarlyAccessCampaign } from "@/lib/earlyAccess/types";

type Counts = {
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  waitlistedApplications: number;
  activeBetaWorkspaces: number;
  invitationsSent: number;
  invitationsAccepted: number;
  agreementsAccepted: number;
  openBugs: number;
  criticalBugs: number;
  featureRequests: number;
  featureVotes: number;
  surveyResponses: number;
  averageSatisfaction: number | null;
  npsScore: number | null;
};

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-line bg-white p-4 transition hover:border-[#108A64]">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={15} />
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function EarlyAccessDashboardPage() {
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);

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

    const [
      totalApplications,
      pendingApplications,
      approvedApplications,
      waitlistedApplications,
      activeBetaWorkspaces,
      invitationsSent,
      invitationsAccepted,
      agreementsAccepted,
      openBugs,
      criticalBugs,
      featureRequests,
      featureVotes,
      surveyResponses,
      satisfactionRows,
      npsRows,
    ] = await Promise.all([
      supabase.from("early_access_applications").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      supabase.from("early_access_applications").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "pending"),
      supabase.from("early_access_applications").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "approved"),
      supabase.from("early_access_applications").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "waitlisted"),
      supabase.from("early_access_agreements").select("workspace_id", { count: "exact", head: true }).eq("campaign_id", c.id),
      supabase.from("early_access_invitations").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("sent_at", "is", null),
      supabase.from("early_access_invitations").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "accepted"),
      supabase.from("early_access_agreements").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      supabase.from("early_access_bug_reports").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["new", "confirmed", "assigned", "in_progress"]),
      supabase.from("early_access_bug_reports").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("severity", "critical").not("status", "in", '("closed","duplicate","cannot_reproduce")'),
      supabase.from("early_access_feature_requests").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      supabase
        .from("early_access_feature_votes")
        .select("id, early_access_feature_requests!inner(campaign_id)", { count: "exact", head: true })
        .eq("early_access_feature_requests.campaign_id", c.id),
      supabase.from("early_access_survey_responses").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      supabase.from("early_access_survey_responses").select("satisfaction_score").eq("campaign_id", c.id).not("satisfaction_score", "is", null),
      supabase.from("early_access_survey_responses").select("nps_score").eq("campaign_id", c.id).not("nps_score", "is", null),
    ]);

    const scores = ((satisfactionRows.data as { satisfaction_score: number }[] | null) ?? []).map(
      (r) => r.satisfaction_score,
    );
    const avgSatisfaction = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const npsScores = ((npsRows.data as { nps_score: number }[] | null) ?? []).map((r) => r.nps_score);
    let nps: number | null = null;
    if (npsScores.length > 0) {
      const promoters = npsScores.filter((s) => s >= 9).length;
      const detractors = npsScores.filter((s) => s <= 6).length;
      nps = Math.round(((promoters - detractors) / npsScores.length) * 100);
    }

    setCounts({
      totalApplications: totalApplications.count ?? 0,
      pendingApplications: pendingApplications.count ?? 0,
      approvedApplications: approvedApplications.count ?? 0,
      waitlistedApplications: waitlistedApplications.count ?? 0,
      activeBetaWorkspaces: activeBetaWorkspaces.count ?? 0,
      invitationsSent: invitationsSent.count ?? 0,
      invitationsAccepted: invitationsAccepted.count ?? 0,
      agreementsAccepted: agreementsAccepted.count ?? 0,
      openBugs: openBugs.count ?? 0,
      criticalBugs: criticalBugs.count ?? 0,
      featureRequests: featureRequests.count ?? 0,
      featureVotes: featureVotes.count ?? 0,
      surveyResponses: surveyResponses.count ?? 0,
      averageSatisfaction: avgSatisfaction,
      npsScore: nps,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-muted">Loading dashboard…</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>
    );
  }
  if (!campaign || !counts) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        No Early Access campaign found.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
        <div>
          <div className="font-bold text-ink">{campaign.name}</div>
          <div className="text-xs text-muted">
            {campaign.version_label} · slug {campaign.slug}
          </div>
        </div>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold capitalize text-ink">
          {campaign.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total applications" value={String(counts.totalApplications)} href="/admin/platform/early-access/applications" />
        <StatCard icon={Clock} label="Pending applications" value={String(counts.pendingApplications)} href="/admin/platform/early-access/applications?status=pending" />
        <StatCard icon={CheckCircle2} label="Approved applications" value={String(counts.approvedApplications)} href="/admin/platform/early-access/applications?status=approved" />
        <StatCard icon={ListPlus} label="Waitlisted applications" value={String(counts.waitlistedApplications)} href="/admin/platform/early-access/applications?status=waitlisted" />

        <StatCard icon={Building2} label="Active beta workspaces" value={String(counts.activeBetaWorkspaces)} href="/admin/platform/early-access/agreements" />
        <StatCard icon={Send} label="Invitations sent" value={String(counts.invitationsSent)} href="/admin/platform/early-access/invitations" />
        <StatCard icon={UserCheck} label="Invitations accepted" value={String(counts.invitationsAccepted)} href="/admin/platform/early-access/invitations?status=accepted" />
        <StatCard icon={FileCheck} label="Agreements accepted" value={String(counts.agreementsAccepted)} href="/admin/platform/early-access/agreements" />

        <StatCard icon={Bug} label="Open bugs" value={String(counts.openBugs)} href="/admin/platform/early-access/bugs" />
        <StatCard icon={AlertOctagon} label="Critical bugs" value={String(counts.criticalBugs)} href="/admin/platform/early-access/bugs?severity=critical" />
        <StatCard icon={Lightbulb} label="Feature requests" value={String(counts.featureRequests)} href="/admin/platform/early-access/features" />
        <StatCard icon={ThumbsUp} label="Feature votes" value={String(counts.featureVotes)} href="/admin/platform/early-access/features" />

        <StatCard icon={ClipboardList} label="Survey responses" value={String(counts.surveyResponses)} href="/admin/platform/early-access/surveys" />
        <StatCard
          icon={Smile}
          label="Average satisfaction"
          value={counts.averageSatisfaction === null ? "No data" : `${counts.averageSatisfaction.toFixed(1)}/10`}
        />
        <StatCard icon={TrendingUp} label="NPS" value={counts.npsScore === null ? "No data" : String(counts.npsScore)} />
      </div>
    </div>
  );
}
