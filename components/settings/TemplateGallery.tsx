"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2, type LucideIcon } from "lucide-react";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const TEMPLATE_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  published: "success",
  archived: "neutral",
};

export type GalleryCard = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  isSystem: boolean;
  badges: string[];
  href: string;
  actionLabel: string;
  /** Which table this row's status pill writes to -- organizer and engagement-letter rows share one list, so this travels per-row instead of once for the whole gallery. */
  statusTable: "organizer_templates" | "engagement_letter_templates";
  icon: LucideIcon;
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// A dense, bordered list (search, status filters, create buttons in the
// toolbar) shared by every template type shown under Form Templates --
// organizer and engagement-letter rows are mixed in the same list, since a
// combined (signable) template is just an organizer template with the
// right field types, not a separate underlying kind.
export function TemplateGallery({
  cards,
  searchPlaceholder,
  emptyMessage,
  createActions,
  onDeleteClick,
}: {
  cards: GalleryCard[];
  searchPlaceholder: string;
  emptyMessage: string;
  createActions: { label: string; onClick: () => void; primary?: boolean }[];
  /** Workspace-owned templates only -- system defaults never show a delete button. */
  onDeleteClick?: (card: GalleryCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(
    () => cards.filter((c) => (!query || c.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || c.status === status)),
    [cards, query, status]
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
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
        <div className="flex items-center gap-2">
          {createActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={
                action.primary
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/90"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent"
              }
            >
              <Plus size={14} /> {action.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState icon={Search} message={cards.length > 0 ? emptyMessage : "No templates yet -- create one to get started."} />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {filtered.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surfaceMuted text-muted">
                  <c.icon size={14} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-ink">{c.name}</h3>
                    {c.isSystem && <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">System</span>}
                  </div>
                  {c.description && <p className="truncate text-xs text-muted">{c.description}</p>}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {c.isSystem ? (
                    <Badge tone={TEMPLATE_STATUS_TONE[c.status] ?? "neutral"} className="capitalize">
                      {c.status}
                    </Badge>
                  ) : (
                    <TemplateStatusCycle table={c.statusTable} id={c.id} status={c.status} />
                  )}
                  {c.badges.map((b) => (
                    <span key={b} className="hidden text-xs text-muted sm:inline">
                      {b}
                    </span>
                  ))}
                  <Link href={c.href} className="text-xs font-medium text-accent hover:underline">
                    {c.actionLabel}
                  </Link>
                  {!c.isSystem && onDeleteClick && (
                    <button
                      type="button"
                      onClick={() => onDeleteClick(c)}
                      aria-label={`Delete ${c.name}`}
                      className="rounded p-1 text-muted opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
