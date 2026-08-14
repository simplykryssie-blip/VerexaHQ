"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Mail, MessageSquare } from "lucide-react";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { TemplateEditRow } from "@/components/settings/TemplateEditRow";
import { CreateTemplateForm } from "@/components/settings/CreateTemplateForm";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

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
}: {
  kind: "email" | "sms";
  workspaceId: string;
  templates: TemplateRow[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // A just-created (or just-duplicated) template won't be in `templates`
  // until the server component re-fetches after router.refresh() -- this
  // stub keeps the edit modal showing something in that gap so create/
  // duplicate -> compose feels instant.
  const [pendingTemplate, setPendingTemplate] = useState<TemplateRow | null>(null);

  const Icon = kind === "email" ? Mail : MessageSquare;
  const kindLabel = kind === "email" ? "email" : "SMS";

  const filtered = useMemo(
    () => templates.filter((t) => (!query || t.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || t.status === status)),
    [templates, query, status]
  );

  const editing = templates.find((t) => t.id === editingId) ?? (pendingTemplate?.id === editingId ? pendingTemplate : null);

  return (
    <div>
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
                    <button type="button" onClick={() => setEditingId(t.id)} className="text-xs font-medium text-accent hover:underline">
                      {isSystem ? "View" : "Edit"}
                    </button>
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
  );
}
