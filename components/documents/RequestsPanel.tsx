"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { InlineAddForm } from "@/components/InlineAddForm";
import type { DocumentRequestRow, DocumentRequestTemplateOption, EntityType } from "./types";

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surfaceMuted">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function RequestsPanel({
  requests,
  templates,
  workspaceId,
  entityType,
  entityId,
}: {
  requests: DocumentRequestRow[];
  templates: DocumentRequestTemplateOption[];
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">New document request</h3>
        {templates.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No document request templates are set up yet.</p>
        ) : (
          <div className="mt-2">
            <InlineAddForm
              label="Request Documents"
              fields={[
                { name: "title", label: "Title", required: true },
                { name: "template_id", label: "Template", type: "select", required: true, options: templates.map((t) => ({ value: t.id, label: t.name })) },
                { name: "due_date", label: "Due date" },
              ]}
              onSubmit={async (v) => {
                const { error } = await supabase.rpc("create_document_request", {
                  p_workspace_id: workspaceId,
                  p_entity_type: entityType,
                  p_entity_id: entityId,
                  p_template_id: v.template_id,
                  p_title: v.title,
                  p_due_date: v.due_date || undefined,
                });
                if (error) return error.message;
                toast.show("Document request created", "success");
                router.refresh();
              }}
            />
          </div>
        )}
      </div>

      {requests.length === 0 ? (
        <EmptyState message="No document requests yet." />
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            const done = r.items.filter((i) => i.status !== "pending").length;
            const overdue = r.status === "open" && r.due_date && new Date(r.due_date) < new Date();
            return (
              <li key={r.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{r.title}</span>
                  <span className={`text-xs capitalize ${overdue ? "text-danger" : "text-muted"}`}>
                    {overdue ? "Overdue" : r.status}
                    {r.due_date && ` -- due ${new Date(r.due_date).toLocaleDateString()}`}
                  </span>
                </div>
                <ProgressBar done={done} total={r.items.length} />
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {r.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between">
                      <span>
                        {item.name} {item.is_required && <span className="text-muted">(required)</span>}
                      </span>
                      <span className="capitalize">{item.status}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
