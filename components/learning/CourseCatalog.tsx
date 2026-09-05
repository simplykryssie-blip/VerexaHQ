"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { IconChip } from "@/components/ui/IconChip";

export type CourseCard = {
  id: string;
  title: string;
  description: string | null;
  ownerName: string | null;
  isOwnFirm: boolean;
  moduleCount: number;
  completedCount: number;
};

export function CourseCatalog({ courses }: { courses: CourseCard[] }) {
  if (courses.length === 0) {
    return <EmptyState message="No published courses yet." icon={GraduationCap} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => {
        const pct = c.moduleCount > 0 ? Math.round((c.completedCount / c.moduleCount) * 100) : 0;
        return (
          <Link
            key={c.id}
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
            {!c.isOwnFirm && c.ownerName && <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted">From {c.ownerName}</p>}
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
      })}
    </div>
  );
}
