"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Share2, Star, Trash2, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { IconChip } from "@/components/ui/IconChip";
import { LibraryFolderPane } from "@/components/library/LibraryFolderPane";
import { FolderMoveSelect } from "@/components/library/FolderMoveSelect";
import { StarButton } from "@/components/library/StarButton";
import type { LibraryFolderRow, StarEntityType } from "@/components/library/types";

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
  folder_id: string | null;
  badges: string[];
  href: string;
  actionLabel: string;
  starred: boolean;
};

// "All" deliberately excludes archived -- an archived template is meant to
// disappear from the normal working view, not just get a label. Reaching it
// is its own explicit filter, same as clicking any other status pill.
const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// A dense, bordered list (search, status filters, a slim create button in
// the toolbar) shared by the Organizer and Engagement Letter libraries,
// which were otherwise duplicating the same search/filter/list/create-modal
// structure with only their row content and create-form fields differing.
export function TemplateGallery({
  workspaceId,
  itemType,
  entityType,
  folders,
  cards,
  icon: Icon,
  statusTable,
  searchPlaceholder,
  emptyMessage,
  createTileLabel,
  onCreateClick,
  onDeleteClick,
  onShareClick,
  onMoveClick,
}: {
  workspaceId: string;
  itemType: "form_template";
  entityType: StarEntityType;
  folders: LibraryFolderRow[];
  cards: GalleryCard[];
  icon: LucideIcon;
  statusTable: "organizer_templates" | "engagement_letter_templates" | "document_request_templates";
  searchPlaceholder: string;
  emptyMessage: string;
  createTileLabel: string;
  onCreateClick: () => void;
  /** Workspace-owned templates only -- system defaults never show a delete button. */
  onDeleteClick?: (card: GalleryCard) => void;
  /** Only passed when this workspace has at least one active downline connection to share with. */
  onShareClick?: (card: GalleryCard) => void;
  onMoveClick: (card: GalleryCard, folderId: string | null) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      cards
        .filter(
          (c) =>
            (!query || c.name.toLowerCase().includes(query.toLowerCase())) &&
            (status === "all" ? c.status !== "archived" : c.status === status) &&
            (!starredOnly || c.starred) &&
            (selectedFolderId === null || c.folder_id === selectedFolderId)
        )
        .sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1)),
    [cards, query, status, starredOnly, selectedFolderId]
  );

  async function restore(card: GalleryCard) {
    setRestoringId(card.id);
    const { error } = await supabase.from(statusTable).update({ status: "published" }).eq("id", card.id);
    setRestoringId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`${card.name} restored`, "success");
    router.refresh();
  }

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) {
      if (c.folder_id) map.set(c.folder_id, (map.get(c.folder_id) ?? 0) + 1);
    }
    return map;
  }, [cards]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <LibraryFolderPane
        workspaceId={workspaceId}
        itemType={itemType}
        canManage
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelect={setSelectedFolderId}
        totalCount={cards.length}
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
            <button
              type="button"
              onClick={() => setStarredOnly((v) => !v)}
              aria-pressed={starredOnly}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                starredOnly ? "border-amber-300 bg-amber-50 text-amber-600" : "border-border text-muted hover:text-ink"
              }`}
            >
              <Star size={12} fill={starredOnly ? "currentColor" : "none"} aria-hidden="true" /> Starred
            </button>
          </div>
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <Plus size={14} /> {createTileLabel}
          </button>
        </div>

        <div className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState icon={Search} message={cards.length > 0 ? emptyMessage : "No templates yet -- create one to get started."} />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
              {filtered.map((c) => (
                <div key={c.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surfaceMuted">
                  {!c.isSystem && <StarButton workspaceId={workspaceId} entityType={entityType} entityId={c.id} starred={c.starred} label={c.name} />}
                  <IconChip tone="accent">
                    <Icon size={16} aria-hidden="true" />
                  </IconChip>

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
                    ) : c.status === "archived" ? (
                      <button
                        type="button"
                        onClick={() => restore(c)}
                        disabled={restoringId === c.id}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        {restoringId === c.id ? "Restoring..." : "Restore"}
                      </button>
                    ) : (
                      <TemplateStatusCycle table={statusTable} id={c.id} status={c.status} />
                    )}
                    {c.badges.map((b) => (
                      <span key={b} className="hidden text-xs text-muted sm:inline">
                        {b}
                      </span>
                    ))}
                    {!c.isSystem && <FolderMoveSelect folders={folders} value={c.folder_id} onChange={(folderId) => onMoveClick(c, folderId)} />}
                    <Link href={c.href} className="text-xs font-medium text-accent hover:underline">
                      {c.actionLabel}
                    </Link>
                    {!c.isSystem && onShareClick && (
                      <button
                        type="button"
                        onClick={() => onShareClick(c)}
                        aria-label={`Share ${c.name} with a downline firm`}
                        className="rounded p-1 text-muted opacity-0 transition hover:bg-accentSoft hover:text-accent group-hover:opacity-100"
                      >
                        <Share2 size={14} />
                      </button>
                    )}
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
    </div>
  );
}
