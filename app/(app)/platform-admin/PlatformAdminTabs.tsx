import Link from "next/link";

const TABS = [
  { href: "/platform-admin", label: "Overview", key: "overview" },
  { href: "/platform-admin/accounts", label: "Accounts", key: "accounts" },
  { href: "/platform-admin/agreements", label: "Agreements", key: "agreements" },
  { href: "/platform-admin/review", label: "Review Queue", key: "review" },
  { href: "/platform-admin/billing", label: "Billing", key: "billing" },
  { href: "/platform-admin/systems", label: "Systems", key: "systems" },
  { href: "/platform-admin/ai-agents", label: "AI Agents", key: "ai-agents" },
] as const;

// Only rendered on pages an is_platform_admin() viewer can reach -- IT-only
// viewers land straight on /platform-admin/systems with no tab strip, since
// Overview and Billing aren't in their reach and a clickable-but-forbidden
// tab is worse than no tab at all.
export function PlatformAdminTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="mb-4 flex w-fit items-center gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            active === t.key ? "bg-accent text-white" : "text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
