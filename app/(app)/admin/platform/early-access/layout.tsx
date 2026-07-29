"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/platform/early-access", label: "Dashboard" },
  { href: "/admin/platform/early-access/applications", label: "Applications" },
  { href: "/admin/platform/early-access/invitations", label: "Invitations" },
  { href: "/admin/platform/early-access/agreements", label: "Agreements" },
  { href: "/admin/platform/early-access/bugs", label: "Bugs" },
  { href: "/admin/platform/early-access/features", label: "Features" },
  { href: "/admin/platform/early-access/announcements", label: "Announcements" },
  { href: "/admin/platform/early-access/surveys", label: "Surveys" },
  { href: "/admin/platform/early-access/templates", label: "Templates" },
  { href: "/admin/platform/early-access/resources", label: "Resources" },
  { href: "/admin/platform/early-access/activity", label: "Activity" },
  { href: "/admin/platform/early-access/settings", label: "Settings" },
];

export default function EarlyAccessAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Early Access</h1>
      <p className="mt-1 text-sm text-muted">
        VerexaHQ Founding Firm Beta — v0.2 Beta. Permanent Early Access program
        management, not beta-only code.
      </p>
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold ${
                active ? "border-[#108A64] text-[#108A64]" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}
