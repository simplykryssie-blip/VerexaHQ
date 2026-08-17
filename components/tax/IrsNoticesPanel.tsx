"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { InlineAddForm } from "@/components/InlineAddForm";

export type IrsNoticeRow = {
  id: string;
  notice_type: string;
  notice_date: string;
  response_due_date: string | null;
  status: "open" | "responded" | "resolved" | "escalated";
  description: string | null;
};

const STATUSES = ["open", "responded", "resolved", "escalated"] as const;

export function IrsNoticesPanel({
  workspaceId,
  entityType,
  entityId,
  notices,
}: {
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
  notices: IrsNoticeRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from("irs_notices")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Log an IRS notice</h3>
        <div className="mt-2">
          <InlineAddForm
            label="Log Notice"
            fields={[
              { name: "notice_type", label: "Notice type (e.g. CP2000)", required: true },
              { name: "notice_date", label: "Notice date", required: true },
              { name: "response_due_date", label: "Response due date" },
              { name: "description", label: "Description", type: "textarea" },
            ]}
            onSubmit={async (v) => {
              const { error } = await supabase.from("irs_notices").insert({
                workspace_id: workspaceId,
                entity_type: entityType,
                entity_id: entityId,
                notice_type: v.notice_type,
                notice_date: v.notice_date,
                response_due_date: v.response_due_date || null,
                description: v.description || null,
              });
              if (error) return error.message;
              router.refresh();
            }}
          />
        </div>
      </div>

      {notices.length === 0 ? (
        <EmptyState message="No IRS notices on file." />
      ) : (
        <ul className="space-y-2">
          {notices.map((n) => {
            const overdue = n.status === "open" && n.response_due_date && new Date(n.response_due_date) < new Date();
            return (
              <li key={n.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {overdue && <AlertTriangle size={14} className="text-danger" aria-hidden="true" />}
                    <span className="text-sm font-medium text-ink">{n.notice_type}</span>
                    <span className="text-xs text-muted">{new Date(n.notice_date).toLocaleDateString()}</span>
                  </div>
                  <select
                    aria-label={`Status for ${n.notice_type}`}
                    value={n.status}
                    onChange={(e) => updateStatus(n.id, e.target.value)}
                    className="rounded-lg border border-border px-2 py-1 text-xs capitalize focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {n.description && <p className="mt-1 text-sm text-slate">{n.description}</p>}
                {n.response_due_date && (
                  <p className={`mt-1 text-xs ${overdue ? "text-danger" : "text-muted"}`}>
                    Response due {new Date(n.response_due_date).toLocaleDateString()}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
