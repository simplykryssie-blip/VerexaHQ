"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2, type LucideIcon } from "lucide-react";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { EmptyState } from "@/components/EmptyState";

export type GalleryCard = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  isSystem: boolean;
  badges: string[];
  href: string;
  actionLabel: string;
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// A visual card gallery (search, status pills, a blank "create new" tile as
// the first grid item, hover-to-reveal actions) shared by the Organizer and
// Engagement Letter libraries, which were otherwise duplicating the same
// search/filter/grid/create-modal structure with only their card content
// and create-form fields differing.
export function TemplateGallery({
  cards,
  icon: Icon,
  statusTable,
  searchPlaceholder,
  emptyMessage,
  createTileLabel,
  onCreateClick,
  onDeleteClick,
}: {
  cards: GalleryCard[];
  icon: LucideIcon;
  statusTable: "organizer_templates" | "engagement_letter_templates";
  searchPlaceholder: string;
  emptyMessage: string;
  createTileLabel: string;
  onCreateClick: () => void;
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

      <div className="mt-4">
        {cards.length > 0 && filtered.length === 0 ? (
          <EmptyState icon={Search} message={emptyMessage} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={onCreateClick}
              className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted transition hover:border-accent hover:text-accent"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surfaceMuted">
                <Plus size={20} />
              </span>
              <span className="text-sm font-medium">{createTileLabel}</span>
            </button>

            {filtered.map((c) => (
              <div key={c.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:shadow-md">
                <div className="relative flex h-20 items-center justify-center bg-gradient-to-br from-accent to-accent/70">
                  <Icon size={30} className="text-white/90" aria-hidden="true" />
                  <div className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition group-hover:opacity-100">
                    <Link
                      href={c.href}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white/90"
                    >
                      {c.actionLabel}
                    </Link>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{c.name}</h3>
                    {c.isSystem ? (
                      <span className="shrink-0 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>
                    ) : (
                      onDeleteClick && (
                        <button
                          type="button"
                          onClick={() => onDeleteClick(c)}
                          aria-label={`Delete ${c.name}`}
                          className="shrink-0 rounded-md p-1 text-muted opacity-0 transition hover:bg-red-50 hover:text-danger group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      )
                    )}
                  </div>
                  {c.description && <p className="mt-1 text-xs text-muted">{c.description}</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {c.isSystem ? (
                      <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium capitalize text-muted">{c.status}</span>
                    ) : (
                      <TemplateStatusCycle table={statusTable} id={c.id} status={c.status} />
                    )}
                    {c.badges.map((b) => (
                      <span key={b} className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">
                        {b}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={c.href}
                    className="mt-3 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                  >
                    {c.actionLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
