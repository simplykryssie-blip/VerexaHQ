"use client";

import Link from "next/link";
import { BookOpen, CheckSquare, CheckCircle2, XCircle, Circle } from "lucide-react";

export type ModuleRow = {
  id: string;
  title: string;
  moduleType: "lesson" | "quiz";
  passed: boolean | null;
  scorePercent: number | null;
};

export function ModuleList({ courseId, modules }: { courseId: string; modules: ModuleRow[] }) {
  if (modules.length === 0) {
    return <p className="text-sm text-muted">This course has no modules yet.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
      {modules.map((m, i) => (
        <Link
          key={m.id}
          href={`/learning/${courseId}/${m.id}`}
          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surfaceMuted"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surfaceMuted text-muted text-xs font-medium">
              {i + 1}
            </span>
            {m.moduleType === "quiz" ? <CheckSquare size={15} className="text-accent" /> : <BookOpen size={15} className="text-accent" />}
            <div>
              <p className="text-sm font-medium text-ink">{m.title}</p>
              <p className="text-[11px] text-muted">
                {m.moduleType === "quiz" ? "Quiz" : "Lesson"}
                {m.moduleType === "quiz" && m.scorePercent != null ? ` -- last score ${m.scorePercent}%` : ""}
              </p>
            </div>
          </div>
          {m.passed === true && <CheckCircle2 size={16} className="text-success" />}
          {m.passed === false && <XCircle size={16} className="text-danger" />}
          {m.passed == null && <Circle size={16} className="text-muted" />}
        </Link>
      ))}
    </div>
  );
}
