import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { REPORT_CATEGORIES } from "@/lib/reportCategories";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isNetworkReportTier } from "@/lib/workspaceCapabilities";
import { IconChip } from "@/components/ui/IconChip";

export const dynamic = "force-dynamic";

// Staff productivity and team performance are both multi-preparer concepts --
// not meaningful for a solo PTIN practice, so they're greyed out (visible,
// not clickable) there instead of just being one more empty report.
const MULTI_PREPARER_REPORT_SLUGS = new Set(["staff-productivity", "team-performance"]);

export default async function ReportsPage() {
  const workspace = await getCurrentWorkspace();
  const hideStaffReport = workspace?.workspace_type === "independent_ptin";
  // Network is fully absent (not just greyed out) for a tier with no
  // downstream network to report on -- an Independent PTIN has none at
  // all, and multi_office_firm's classification is intentionally
  // unresolved (Phase 5D/5E audits). Unlike staff-productivity/
  // team-performance above, this isn't "not applicable to a solo
  // practice" (still visible, disabled) -- it's "not a capability this
  // workspace has", so it shouldn't appear as an option at all.
  const showNetworkReport = workspace ? isNetworkReportTier(workspace) : false;
  const visibleCategories = REPORT_CATEGORIES.filter((c) => c.slug !== "network" || showNetworkReport);

  return (
    <>
      <PageHeader title="Reports" description="Reporting across your practice, by category." />
      <div className="flex-1 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleCategories.map((c) => {
            const disabled = hideStaffReport && MULTI_PREPARER_REPORT_SLUGS.has(c.slug);
            if (disabled) {
              return (
                <div
                  key={c.slug}
                  className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5 opacity-50"
                  title="Not applicable to a solo PTIN practice"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surfaceMuted text-muted">
                    <c.icon size={18} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-muted">{c.title}</h2>
                    <p className="mt-1 text-sm text-muted">{c.description}</p>
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={c.slug}
                href={`/reports/${c.slug}`}
                className="flex items-start gap-4 rounded-2xl border border-border bg-surface shadow-soft p-5 transition hover:border-accent hover:shadow-softHover"
              >
                <IconChip tone={c.tone}>
                  <c.icon size={18} strokeWidth={2} aria-hidden="true" />
                </IconChip>
                <div>
                  <h2 className="text-sm font-semibold text-ink">{c.title}</h2>
                  <p className="mt-1 text-sm text-muted">{c.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
