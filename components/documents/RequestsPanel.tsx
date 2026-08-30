"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { InlineAddForm } from "@/components/InlineAddForm";
import { renderEmail } from "@/lib/email/template";
import type { Audience, DocumentRequestRow, DocumentRequestTemplateOption, EntityType } from "./types";

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surfaceMuted">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

const UNCATEGORIZED = "Other";

/** Groups items by category, keeping first-seen category order; items with no category fall under "Other" at the end. */
function groupByCategory<T extends { category?: string | null }>(items: T[]): { category: string; items: T[] }[] {
  const order: string[] = [];
  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const category = item.category?.trim() || UNCATEGORIZED;
    if (!byCategory.has(category)) {
      order.push(category);
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(item);
  }
  const ordered = order.filter((c) => c !== UNCATEGORIZED);
  if (byCategory.has(UNCATEGORIZED)) ordered.push(UNCATEGORIZED);
  return ordered.map((category) => ({ category, items: byCategory.get(category)! }));
}

export function RequestsPanel({
  requests,
  templates,
  workspaceId,
  entityType,
  entityId,
  audience = "staff",
  canCreate = true,
  clientEmail,
}: {
  requests: DocumentRequestRow[];
  templates: DocumentRequestTemplateOption[];
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  audience?: Audience;
  canCreate?: boolean;
  clientEmail?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  async function uploadForItem(itemId: string, file: File) {
    setUploadingItemId(itemId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const path = `${workspaceId}/${entityId}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, file);
    if (uploadErr) {
      toast.show(uploadErr.message, "error");
      setUploadingItemId(null);
      return;
    }
    const { data: attachment, error: insertErr } = await supabase
      .from("attachments")
      .insert({
        workspace_id: workspaceId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        uploaded_by: user?.id,
        visibility: audience === "portal" ? "client_visible" : "internal",
      })
      .select("id")
      .single();
    if (insertErr || !attachment) {
      toast.show(insertErr?.message ?? "Upload failed", "error");
      setUploadingItemId(null);
      return;
    }
    const { error: fulfillErr } = await supabase.rpc("fulfill_document_request_item", {
      p_item_status_id: itemId,
      p_attachment_id: attachment.id,
    });
    setUploadingItemId(null);
    if (fulfillErr) {
      toast.show(fulfillErr.message, "error");
      return;
    }
    toast.show("Document uploaded", "success");
    router.refresh();
  }

  async function markReceived(itemId: string) {
    const { error } = await supabase.rpc("mark_document_request_item_received", { p_item_status_id: itemId });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Marked as received", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {audience === "staff" && canCreate && (
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
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
                  { name: "due_date", label: "Due date", type: "date" },
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

                  if (clientEmail) {
                    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                    fetch("/api/email/send", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        to: clientEmail,
                        sender: "notifications",
                        subject: `Documents requested: ${v.title}`,
                        html: renderEmail({
                          heading: "We need a few documents from you",
                          bodyHtml: `<p>Please log in to your client portal to review and upload what's requested for <strong>${v.title}</strong>.</p>`,
                          ctaLabel: "Go to portal",
                          ctaUrl: `${appUrl}/portal/login`,
                        }),
                      }),
                    }).catch(() => {
                      // Best-effort -- the request itself is already created.
                    });
                  }

                  router.refresh();
                }}
              />
            </div>
          )}
        </div>
      )}

      {requests.length === 0 ? (
        <EmptyState message="No document requests yet." />
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            const done = r.items.filter((i) => i.status !== "pending").length;
            const overdue = r.status === "open" && r.due_date && new Date(r.due_date) < new Date();
            return (
              <li key={r.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{r.title}</span>
                  <span className={`text-xs capitalize ${overdue ? "text-danger" : "text-muted"}`}>
                    {overdue ? "Overdue" : r.status}
                    {r.due_date && ` -- due ${new Date(r.due_date).toLocaleDateString()}`}
                  </span>
                </div>
                <ProgressBar done={done} total={r.items.length} />
                {(() => {
                  const hasCategories = r.items.some((i) => i.category?.trim());
                  const groups = hasCategories ? groupByCategory(r.items) : [{ category: "", items: r.items }];
                  return (
                    <div className="mt-2 space-y-2">
                      {groups.map((group) => (
                        <div key={group.category || "__flat"}>
                          {group.category && (
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{group.category}</p>
                          )}
                          <ul className="mt-1 space-y-1 text-xs text-muted">
                            {group.items.map((item) => (
                              <li key={item.id} className="flex items-center justify-between gap-2">
                                <span>
                                  {item.name} {item.is_required && <span className="text-muted">(required)</span>}
                                </span>
                                {item.status === "pending" ? (
                                  <span className="flex shrink-0 items-center gap-2">
                                    <label className="flex cursor-pointer items-center gap-1 text-accent hover:underline">
                                      <Paperclip size={12} aria-hidden="true" />
                                      {uploadingItemId === item.id ? "Uploading..." : "Upload"}
                                      <input
                                        type="file"
                                        className="sr-only"
                                        disabled={uploadingItemId !== null}
                                        onChange={(e) => e.target.files?.[0] && uploadForItem(item.id, e.target.files[0])}
                                      />
                                    </label>
                                    {audience === "staff" && (
                                      <button type="button" onClick={() => markReceived(item.id)} className="text-muted hover:text-accent hover:underline">
                                        Mark received
                                      </button>
                                    )}
                                  </span>
                                ) : (
                                  <span className="capitalize">{item.status}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
