import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { REPORT_CATEGORIES } from "@/lib/reportCategories";
import { getCurrentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// Staff productivity is a multi-preparer concept -- not meaningful for a
// solo PTIN practice, so it's greyed out (visible, not clickable) there
// instead of just being one more empty report.
const STAFF_REPORT_SLUG = "staff-productivity";

export default async function ReportsPage() {
  const workspace = await getCurrentWorkspace();
  const hideStaffReport = workspace?.workspace_type === "independent_ptin";

  return (
    <>
      <PageHeader title="Reports" description="Reporting across your practice, by category." />
      <div className="flex-1 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {REPORT_CATEGORIES.map((c) => {
            const disabled = hideStaffReport && c.slug === STAFF_REPORT_SLUG;
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
                className="flex items-start gap-4 rounded-2xl border border-border bg-surface shadow-soft p-5 transition hover:border-accent hover:shadow-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
                  <c.icon size={18} strokeWidth={2} aria-hidden="true" />
                </span>
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
