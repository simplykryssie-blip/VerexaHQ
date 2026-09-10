"use client";

import Link from "next/link";
import { BookOpen, CheckSquare, CheckCircle2, XCircle, Circle, Lock, Video } from "lucide-react";
import { isModuleUnlocked, unlockDate, type ScheduleAnchor } from "@/lib/learning/dripSchedule";

export type ModuleRow = {
  id: string;
  title: string;
  moduleType: "lesson" | "quiz" | "live_session";
  passed: boolean | null;
  scorePercent: number | null;
  releaseDate: string | null;
  releaseOffsetDays: number | null;
  liveSessionStart?: string | null;
};

export function ModuleList({
  courseId,
  modules,
  scheduleAnchor,
}: {
  courseId: string;
  modules: ModuleRow[];
  scheduleAnchor: ScheduleAnchor;
}) {
  if (modules.length === 0) {
    return <p className="text-sm text-muted">This course has no modules yet.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
      {modules.map((m, i) => {
        const unlocked = isModuleUnlocked(m, scheduleAnchor);
        const availableAt = unlocked ? null : unlockDate(m, scheduleAnchor);

        const rowContent = (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surfaceMuted text-muted text-xs font-medium">
                {i + 1}
              </span>
              {unlocked ? (
                m.moduleType === "quiz" ? (
                  <CheckSquare size={15} className="text-accent" />
                ) : m.moduleType === "live_session" ? (
                  <Video size={15} className="text-accent" />
                ) : (
                  <BookOpen size={15} className="text-accent" />
                )
              ) : (
                <Lock size={15} className="text-muted" />
              )}
              <div>
                <p className={`text-sm font-medium ${unlocked ? "text-ink" : "text-muted"}`}>{m.title}</p>
                <p className="text-[11px] text-muted">
                  {unlocked
                    ? m.moduleType === "live_session"
                      ? `Live session${
                          m.liveSessionStart
                            ? ` -- ${new Date(m.liveSessionStart).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                            : ""
                        }`
                      : `${m.moduleType === "quiz" ? "Quiz" : "Lesson"}${
                          m.moduleType === "quiz" && m.scorePercent != null ? ` -- last score ${m.scorePercent}%` : ""
                        }`
                    : `Available ${availableAt ? availableAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "soon"}`}
                </p>
              </div>
            </div>
            {unlocked && m.moduleType !== "live_session" && m.passed === true && <CheckCircle2 size={16} className="text-success" />}
            {unlocked && m.moduleType !== "live_session" && m.passed === false && <XCircle size={16} className="text-danger" />}
            {unlocked && m.moduleType !== "live_session" && m.passed == null && <Circle size={16} className="text-muted" />}
          </>
        );

        if (!unlocked) {
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 opacity-70">
              {rowContent}
            </div>
          );
        }

        return (
          <Link
            key={m.id}
            href={`/learning/${courseId}/${m.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surfaceMuted"
          >
            {rowContent}
          </Link>
        );
      })}
    </div>
  );
}
