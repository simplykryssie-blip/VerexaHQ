"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Bug, Lightbulb, ClipboardList, BookOpen, ArrowRight, LifeBuoy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { useUnreadAnnouncementCount } from "@/lib/earlyAccess/useUnreadAnnouncementCount";
import type { EarlyAccessSettings, SupportProcess } from "@/lib/earlyAccess/types";

export default function EarlyAccessHubPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const unread = useUnreadAnnouncementCount(activeWorkspaceId, campaign?.id ?? null);
  const [supportProcess, setSupportProcess] = useState<SupportProcess | null>(null);

  const loadSettings = useCallback(async () => {
    if (!campaign) return;
    const { data } = await supabase
      .from("early_access_settings")
      .select("support_process")
      .eq("campaign_id", campaign.id)
      .maybeSingle();
    const settings = data as Pick<EarlyAccessSettings, "support_process"> | null;
    if (settings?.support_process && "instructions" in settings.support_process) {
      setSupportProcess(settings.support_process as SupportProcess);
    }
  }, [campaign]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (!inProgram || !campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        <p>Your workspace hasn&apos;t joined an Early Access program yet.</p>
        <Link href="/early-access/apply" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#108A64]">
          Check for open applications <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  const cards = [
    { href: "/early-access/announcements", icon: Megaphone, label: "Announcements", badge: unread },
    { href: "/early-access/bugs", icon: Bug, label: "Bug reports", badge: 0 },
    { href: "/early-access/features", icon: Lightbulb, label: "Feature requests", badge: 0 },
    { href: "/early-access/surveys", icon: ClipboardList, label: "Surveys", badge: 0 },
    { href: "/early-access/resources", icon: BookOpen, label: "Resources", badge: 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Early Access Center</h1>
      <p className="mt-1 text-sm text-muted">
        {campaign.name} · {campaign.version_label}
      </p>

      <Link
        href="/early-access/onboarding"
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2.5 text-sm font-semibold text-white"
      >
        Continue onboarding <ArrowRight size={14} />
      </Link>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="relative rounded-2xl border border-line bg-white p-5 transition hover:border-[#108A64]">
            {c.badge > 0 && (
              <span className="absolute right-4 top-4 grid h-5 min-w-5 place-items-center rounded-full bg-[#108A64] px-1 text-[10px] font-bold text-white">
                {c.badge > 9 ? "9+" : c.badge}
              </span>
            )}
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-[#108A64]">
              <c.icon size={20} />
            </div>
            <h2 className="mt-4 font-bold text-ink">{c.label}</h2>
          </Link>
        ))}
      </div>

      {supportProcess && (
        <section className="mt-8 rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center gap-2">
            <LifeBuoy size={17} className="text-[#108A64]" />
            <h2 className="font-bold text-ink">Support</h2>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
            {supportProcess.instructions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 text-xs text-muted sm:grid-cols-2">
            <div>
              <span className="font-bold uppercase tracking-wide">Support email</span>
              <div className="mt-0.5 text-ink">{supportProcess.support_email}</div>
            </div>
            <div>
              <span className="font-bold uppercase tracking-wide">Critical issues</span>
              <div className="mt-0.5 text-ink">{supportProcess.critical_definition} — {supportProcess.critical_response_target}</div>
            </div>
            <div>
              <span className="font-bold uppercase tracking-wide">Standard response</span>
              <div className="mt-0.5 text-ink">{supportProcess.standard_response_target}</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
