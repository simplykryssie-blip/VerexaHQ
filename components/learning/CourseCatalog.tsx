"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GraduationCap, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { IconChip } from "@/components/ui/IconChip";

export type CourseCard = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  ownerName: string | null;
  isOwnFirm: boolean;
  moduleCount: number;
  completedCount: number;
  dueDate: string | null;
  isAssigned: boolean;
};

function CourseTile({ c }: { c: CourseCard }) {
  const pct = c.moduleCount > 0 ? Math.round((c.completedCount / c.moduleCount) * 100) : 0;
  const overdue = Boolean(c.dueDate && pct < 100 && new Date(c.dueDate) < new Date());
  return (
    <Link
      href={`/learning/${c.id}`}
      className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:border-accent"
    >
      <div className="flex items-center gap-2">
        <IconChip tone="accent">
          <GraduationCap size={16} />
        </IconChip>
        <p className="text-sm font-semibold text-ink">{c.title}</p>
      </div>
      {c.description && <p className="mt-2 line-clamp-2 text-xs text-muted">{c.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {c.category && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted">{c.category}</span>}
        {!c.isOwnFirm && c.ownerName && <span className="text-[10px] font-medium uppercase tracking-wide text-muted">From {c.ownerName}</span>}
      </div>
      {c.dueDate && (
        <p className={`mt-2 flex items-center gap-1 text-[11px] font-medium ${overdue ? "text-danger" : "text-accent"}`}>
          {overdue && <AlertTriangle size={11} aria-hidden="true" />}
          {overdue ? "Overdue -- was due" : "Due"} {new Date(c.dueDate).toLocaleDateString()}
        </p>
      )}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surfaceMuted">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-muted">
          {c.completedCount} of {c.moduleCount} module{c.moduleCount === 1 ? "" : "s"} complete
        </p>
      </div>
    </Link>
  );
}

export function CourseCatalog({ courses }: { courses: CourseCard[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(courses.map((c) => c.category).filter((c): c is string => Boolean(c)))).sort(), [courses]);
  const assigned = useMemo(
    () =>
      courses
        .filter((c) => c.isAssigned)
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    [courses]
  );

  const filtered = courses.filter((c) => {
    if (categoryFilter && c.category !== categoryFilter) return false;
    if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (courses.length === 0) {
    return <EmptyState message="No published courses yet." icon={GraduationCap} />;
  }

  return (
    <div className="space-y-6">
      {assigned.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Assigned to you</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assigned.map((c) => (
              <CourseTile key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">All courses</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses..."
            aria-label="Search courses"
            className="w-56 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === category ? null : category)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                categoryFilter === category ? "border-accent bg-accentSoft text-accent" : "border-border text-muted hover:text-ink"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No courses match your search." icon={GraduationCap} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <CourseTile key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
