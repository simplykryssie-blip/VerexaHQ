"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Mail, MessageSquare, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { TemplateEditRow } from "@/components/settings/TemplateEditRow";
import { CreateTemplateForm } from "@/components/settings/CreateTemplateForm";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { LibraryFolderPane } from "@/components/library/LibraryFolderPane";
import { FolderMoveSelect } from "@/components/library/FolderMoveSelect";
import type { LibraryFolderRow } from "@/components/library/types";

const TEMPLATE_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  published: "success",
  archived: "neutral",
};

type TemplateRow = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  folder_id?: string | null;
  subject?: string | null;
  body_html?: string | null;
  body?: string | null;
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function mergeFieldCount(text: string) {
  const matches = text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
  return new Set(matches).size;
}

// A dense, bordered list (search, status filters, a slim create button in
// the toolbar) rather than a grid of oversized cards. Email/SMS templates
// have no dedicated edit page (unlike Organizers/Engagement Letters), so
// this opens a Modal for editing/creating instead of navigating to a route.
export function EmailSmsTemplateGallery({
  kind,
  workspaceId,
  templates,
  folders,
}: {
  kind: "email" | "sms";
  workspaceId: string;
  templates: TemplateRow[];
  folders: LibraryFolderRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // A just-created (or just-duplicated) template won't be in `templates`
  // until the server component re-fetches after router.refresh() -- this
  // stub keeps the edit modal showing something in that gap so create/
  // duplicate -> compose feels instant.
  const [pendingTemplate, setPendingTemplate] = useState<TemplateRow | null>(null);

  const Icon = kind === "email" ? Mail : MessageSquare;
  const kindLabel = kind === "email" ? "email" : "SMS";

  const filtered = useMemo(
    () =>
      templates.filter(
        (t) =>
          (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
          (status === "all" || t.status === status) &&
          (selectedFolderId === null || t.folder_id === selectedFolderId)
      ),
    [templates, query, status, selectedFolderId]
  );

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of templates) {
      if (t.folder_id) map.set(t.folder_id, (map.get(t.folder_id) ?? 0) + 1);
    }
    return map;
  }, [templates]);

  const editing = templates.find((t) => t.id === editingId) ?? (pendingTemplate?.id === editingId ? pendingTemplate : null);

  async function deleteTemplate(t: TemplateRow) {
    if (!window.confirm(`Delete "${t.name}"? This can't be undone.`)) return;
    setDeletingId(t.id);
    const table = kind === "email" ? "email_templates" : "sms_templates";
    const { error } = await supabase.from(table).delete().eq("id", t.id);
    setDeletingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function moveTemplate(t: TemplateRow, folderId: string | null) {
    const table = kind === "email" ? "email_templates" : "sms_templates";
    const { error } = await supabase.from(table).update({ folder_id: folderId }).eq("id", t.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <LibraryFolderPane
        workspaceId={workspaceId}
        itemType="email_sms_template"
        canManage
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelect={setSelectedFolderId}
        totalCount={templates.length}
        counts={folderCounts}
        rootLabel="All templates"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${kindLabel} templates...`}
                className="w-72 rounded-lg border border-border py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    status === f.value ? "bg-accentSoft text-accent" : "text-muted hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <Plus size={14} /> New {kindLabel} template
          </button>
        </div>

        <div className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState icon={Search} message={templates.length > 0 ? `No ${kindLabel} templates match.` : `No ${kindLabel} templates yet -- create one to get started.`} />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {filtered.map((t) => {
                const isSystem = !t.workspace_id;
                const tokenCount = mergeFieldCount(`${t.subject ?? ""} ${kind === "email" ? t.body_html ?? "" : t.body ?? ""}`);
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surfaceMuted text-muted">
                      <Icon size={14} aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-ink">{t.name}</h3>
                        {isSystem && <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">System</span>}
                      </div>
                      {kind === "email" && t.subject && <p className="truncate text-xs text-muted">{t.subject}</p>}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      {isSystem ? (
                        <Badge tone={TEMPLATE_STATUS_TONE[t.status] ?? "neutral"} className="capitalize">
                          {t.status}
                        </Badge>
                      ) : (
                        <TemplateStatusCycle table={kind === "email" ? "email_templates" : "sms_templates"} id={t.id} status={t.status} />
                      )}
                      {tokenCount > 0 && <span className="hidden text-xs text-muted sm:inline">{tokenCount} field{tokenCount === 1 ? "" : "s"}</span>}
                      {!isSystem && <FolderMoveSelect folders={folders} value={t.folder_id ?? null} onChange={(folderId) => moveTemplate(t, folderId)} />}
                      <button type="button" onClick={() => setEditingId(t.id)} className="text-xs font-medium text-accent hover:underline">
                        {isSystem ? "View" : "Edit"}
                      </button>
                      {!isSystem && (
                        <button
                          type="button"
                          onClick={() => deleteTemplate(t)}
                          disabled={deletingId === t.id}
                          aria-label={`Delete ${t.name}`}
                          className="text-muted hover:text-danger disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
              );
            })}
          </div>
        )}
        </div>

        {editing && (
          <TemplateEditRow
            kind={kind}
            template={editing}
            workspaceId={workspaceId}
            onClose={() => {
              setEditingId(null);
              setPendingTemplate(null);
            }}
            onDuplicated={(row) => {
              setPendingTemplate(row);
              setEditingId(row.id);
            }}
          />
        )}

        {creating && (
          <Modal title={`New ${kindLabel} template`} onClose={() => setCreating(false)}>
            <CreateTemplateForm
              workspaceId={workspaceId}
              kind={kind}
              defaultOpen
              onSuccess={(row) => {
                setCreating(false);
                setPendingTemplate({ id: row.id, name: row.name, status: "draft", workspace_id: workspaceId, subject: "", body_html: "", body: "" });
                setEditingId(row.id);
              }}
            />
          </Modal>
        )}
      </div>
    </div>
  );
}
