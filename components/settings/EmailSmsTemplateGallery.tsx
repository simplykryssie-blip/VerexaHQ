"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Mail, MessageSquare } from "lucide-react";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { TemplateEditRow } from "@/components/settings/TemplateEditRow";
import { CreateTemplateForm } from "@/components/settings/CreateTemplateForm";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";

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

// Email/SMS templates have no dedicated edit page (unlike Organizers/
// Engagement Letters), so this mirrors TemplateGallery's card-grid look but
// opens a Modal for editing/creating instead of navigating to a route.
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

  const Icon = kind === "email" ? Mail : MessageSquare;
  const kindLabel = kind === "email" ? "email" : "SMS";

  const filtered = useMemo(
    () => templates.filter((t) => (!query || t.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || t.status === status)),
    [templates, query, status]
  );

  const editing = templates.find((t) => t.id === editingId) ?? null;

  return (
    <div>
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

      <div className="mt-4">
        {templates.length > 0 && filtered.length === 0 ? (
          <EmptyState icon={Search} message={`No ${kindLabel} templates match.`} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted transition hover:border-accent hover:text-accent"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surfaceMuted">
                <Plus size={20} />
              </span>
              <span className="text-sm font-medium">Create new {kindLabel} template</span>
            </button>

            {filtered.map((t) => {
              const isSystem = !t.workspace_id;
              const tokenCount = mergeFieldCount(`${t.subject ?? ""} ${kind === "email" ? t.body_html ?? "" : t.body ?? ""}`);
              return (
                <div key={t.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:shadow-md">
                  <div className="relative flex h-20 items-center justify-center bg-gradient-to-br from-accent to-accent/70">
                    <Icon size={30} className="text-white/90" aria-hidden="true" />
                    <div className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditingId(t.id)}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white/90"
                      >
                        {isSystem ? "View" : "Edit"}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{t.name}</h3>
                      {isSystem && <span className="shrink-0 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
                    </div>
                    {kind === "email" && t.subject && <p className="mt-1 truncate text-xs text-muted">{t.subject}</p>}

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {isSystem ? (
                        <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium capitalize text-muted">{t.status}</span>
                      ) : (
                        <TemplateStatusCycle table={kind === "email" ? "email_templates" : "sms_templates"} id={t.id} status={t.status} />
                      )}
                      {tokenCount > 0 && (
                        <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">
                          {tokenCount} merge field{tokenCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingId(t.id)}
                      className="mt-3 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                    >
                      {isSystem ? "View" : "Edit"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && <TemplateEditRow kind={kind} template={editing} onClose={() => setEditingId(null)} />}

      {creating && (
        <Modal title={`New ${kindLabel} template`} onClose={() => setCreating(false)}>
          <CreateTemplateForm workspaceId={workspaceId} kind={kind} defaultOpen onSuccess={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
