"use client";
import Link from "next/link";
import { Megaphone, Bug, Lightbulb, ClipboardList, ArrowRight } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { useUnreadAnnouncementCount } from "@/lib/earlyAccess/useUnreadAnnouncementCount";

export default function EarlyAccessHubPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const unread = useUnreadAnnouncementCount(activeWorkspaceId, campaign?.id ?? null);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (!inProgram || !campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Your workspace hasn&apos;t joined an Early Access program yet.
      </div>
    );
  }

  const cards = [
    { href: "/early-access/announcements", icon: Megaphone, label: "Announcements", badge: unread },
    { href: "/early-access/bugs", icon: Bug, label: "Bug reports", badge: 0 },
    { href: "/early-access/features", icon: Lightbulb, label: "Feature requests", badge: 0 },
    { href: "/early-access/surveys", icon: ClipboardList, label: "Surveys", badge: 0 },
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  );
}
