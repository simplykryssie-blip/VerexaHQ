import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { REPORT_CATEGORIES } from "@/lib/reportCategories";

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Reporting across your practice, by category." />
      <div className="flex-1 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {REPORT_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/reports/${c.slug}`}
              className="rounded-xl border border-border bg-surface p-5 transition hover:border-accent"
            >
              <h2 className="text-sm font-semibold text-ink">{c.title}</h2>
              <p className="mt-1 text-sm text-muted">{c.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
