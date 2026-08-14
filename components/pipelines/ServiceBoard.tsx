"use client";

import Link from "next/link";
import { StageReviewActions } from "@/app/(app)/engagements/[id]/StageReviewActions";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

export type StageColumn = { id: string; name: string; display_order: number };
export type BoardCard = {
  id: string;
  engagement_number: string | null;
  priority: string | null;
  due_date: string | null;
  clientLabel: string;
  clientHref: string;
  processStageId: string;
  workflowStageId: string;
};

const PRIORITY_TONE: Record<string, BadgeTone> = {
  Low: "neutral",
  Medium: "accent",
  High: "warning",
  Urgent: "danger",
};

export function ServiceBoard({ stages, cards }: { stages: StageColumn[]; cards: BoardCard[] }) {
  return (
    <div>
      {stages.length === 0 ? (
        <p className="text-sm text-muted">This service has no workflow stages configured yet.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const items = cards.filter((c) => c.processStageId === stage.id);
            return (
              <div key={stage.id} className="w-72 shrink-0 rounded-xl border border-border bg-surfaceMuted">
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{stage.name}</h3>
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2 px-3 pb-3" style={{ minHeight: "56px" }}>
                  {items.length === 0 && <p className="py-2 text-xs text-muted">No engagements here.</p>}
                  {items.map((c) => {
                    const overdue = Boolean(c.due_date && new Date(c.due_date) < new Date());
                    return (
                      <div key={c.id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                        <Link href={`/engagements/${c.id}`} className="text-sm font-medium text-accent hover:underline">
                          {c.engagement_number ?? "Engagement"}
                        </Link>
                        <p className="mt-0.5 truncate text-sm text-slate">
                          <Link href={c.clientHref} className="hover:text-accent hover:underline">
                            {c.clientLabel}
                          </Link>
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {c.priority && <Badge tone={PRIORITY_TONE[c.priority] ?? "neutral"}>{c.priority}</Badge>}
                          {c.due_date && (
                            <span className={`text-[11px] ${overdue ? "font-medium text-danger" : "text-muted"}`}>
                              {new Date(c.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <StageReviewActions stageId={c.workflowStageId} label="Mark stage complete" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
