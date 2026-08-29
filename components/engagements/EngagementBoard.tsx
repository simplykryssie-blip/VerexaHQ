"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { ENGAGEMENT_STATUS_OPTIONS, ENGAGEMENT_PRIORITY_TONE } from "@/lib/engagementStatus";
import { Badge } from "@/components/ui/Badge";

export type BoardEngagement = {
  id: string;
  engagement_number: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  clientLabel: string;
  clientHref: string;
};

export function EngagementBoard({ engagements: initial }: { engagements: BoardEngagement[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [engagements, setEngagements] = useState(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const columns = ENGAGEMENT_STATUS_OPTIONS.map((status) => ({
    status,
    items: engagements.filter((e) => e.status === status),
  }));

  const SIGNATURE_GATED_STATUSES = ["Waiting On Payment", "Ready To Release", "Completed"];
  const PAYMENT_GATED_STATUSES = ["Ready To Release", "Completed"];

  async function moveTo(id: string, status: string) {
    const current = engagements.find((e) => e.id === id);
    if (!current || current.status === status) return;

    if (SIGNATURE_GATED_STATUSES.includes(status)) {
      const { data: hasSignedLetter } = await supabase.rpc("engagement_has_signed_letter", { p_engagement_id: id });
      if (!hasSignedLetter) {
        const proceed = window.confirm(
          `This engagement doesn't have a completed, signed engagement letter on file. Move it to "${status}" anyway?`
        );
        if (!proceed) return;
      }
    }

    if (PAYMENT_GATED_STATUSES.includes(status)) {
      const { data: paymentOk } = await supabase.rpc("engagement_meets_payment_requirement", { p_engagement_id: id });
      if (!paymentOk) {
        const proceed = window.confirm(
          `This engagement's service requires payment before release, and there's no paid invoice on file. Move it to "${status}" anyway?`
        );
        if (!proceed) return;
      }
    }

    setEngagements((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));

    const { error } = await supabase.from("engagements").update({ status }).eq("id", id);
    if (error) {
      setEngagements((prev) => prev.map((e) => (e.id === id ? { ...e, status: current.status } : e)));
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3" style={{ minWidth: "max-content" }}>
        {columns.map((col) => (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(col.status);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === col.status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStatus(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) moveTo(id, col.status);
            }}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-surfaceMuted transition ${
              dragOverStatus === col.status ? "border-accent ring-2 ring-accent/30" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{col.status}</h3>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">{col.items.length}</span>
            </div>
            <div className="flex-1 space-y-2 px-2 pb-2" style={{ minHeight: "60px" }}>
              {col.items.map((e) => {
                const overdue = Boolean(e.due_date && new Date(e.due_date) < new Date() && !["Completed", "Archived"].includes(e.status));
                return (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData("text/plain", e.id);
                      ev.dataTransfer.effectAllowed = "move";
                      setDraggingId(e.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`cursor-grab rounded-lg border border-border bg-surface p-3 shadow-soft transition hover:shadow-softHover active:cursor-grabbing ${
                      draggingId === e.id ? "opacity-40" : ""
                    }`}
                  >
                    <Link href={`/engagements/${e.id}`} className="text-sm font-medium text-accent hover:underline">
                      {e.engagement_number ?? "Engagement"}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-slate">
                      <Link href={e.clientHref} className="hover:text-accent hover:underline">
                        {e.clientLabel}
                      </Link>
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {e.priority && <Badge tone={ENGAGEMENT_PRIORITY_TONE[e.priority] ?? "neutral"}>{e.priority}</Badge>}
                      {e.due_date && (
                        <span className={`text-[11px] ${overdue ? "font-medium text-danger" : "text-muted"}`}>
                          {new Date(e.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
