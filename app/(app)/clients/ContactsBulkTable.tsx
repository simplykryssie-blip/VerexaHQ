"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Download, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { ensureTagConfirmed } from "@/lib/ensureTag";
import { CLIENT_COLUMNS, clientDisplayName, type ClientRow } from "./clientListColumns";

function toCsvValue(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(rows: ClientRow[]) {
  const header = ["Name", "Type", "Email", "Phone", "Status", "Tags"];
  const lines = rows.map((c) =>
    [
      clientDisplayName(c),
      c.client_type,
      c.primary_email ?? "",
      c.primary_phone ?? "",
      c.lifecycle_status,
      (c.tags ?? []).join("; "),
    ]
      .map(toCsvValue)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Two bulk actions, not the full original wishlist (assign staff / send
// template / create engagement / archive) -- those each carry enough of
// their own edge cases (a template needing per-recipient merge fields, an
// engagement needing a service picked, archiving needing the same care as
// the single-client flow) that bolting them on as a bulk no-questions-asked
// loop risked doing the wrong thing at volume. Tagging and exporting are
// safe to batch: both are non-destructive and identical for every row.
export function ContactsBulkTable({
  rows,
  workspaceId,
  canManage,
  emptyMessage,
  emptyAction,
}: {
  rows: ClientRow[];
  workspaceId: string;
  canManage: boolean;
  emptyMessage: string;
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [tagging, setTagging] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    if (!(await ensureTagConfirmed(supabase, workspaceId, tag))) return;

    setTagging(true);
    const results = await Promise.all(
      selectedRows.map((row) =>
        supabase
          .from("clients")
          .update({ tags: Array.from(new Set([...(row.tags ?? []), tag])) })
          .eq("id", row.id)
      )
    );
    setTagging(false);
    const failed = results.filter((r) => r.error).length;
    if (failed > 0) toast.show(`Tagged ${selectedRows.length - failed} of ${selectedRows.length} contacts -- ${failed} failed`, "error");
    else toast.show(`Tagged ${selectedRows.length} contact${selectedRows.length === 1 ? "" : "s"} with "${tag}"`, "success");

    setTagInput("");
    setTagOpen(false);
    setSelected(new Set());
    router.refresh();
  }

  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} action={emptyAction} />;
  }

  return (
    <div>
      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accentSoft px-5 py-2.5">
          <span className="text-xs font-medium text-accent">
            {selected.size} selected
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setTagOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-surface px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
            >
              <Tag size={13} /> Add tag
            </button>
            {tagOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 flex w-64 items-center gap-1.5 rounded-lg border border-border bg-surface p-2 shadow-lg">
                <input
                  autoFocus
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void applyTag();
                  }}
                  placeholder="Tag name..."
                  className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => void applyTag()}
                  disabled={!tagInput.trim() || tagging}
                  className="shrink-0 rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {tagging ? "..." : "Apply"}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(selectedRows)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-surface px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
          >
            <Download size={13} /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
          >
            <X size={13} /> Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
              {canManage && (
                <th className="w-10 px-5 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all contacts" />
                </th>
              )}
              {CLIENT_COLUMNS.map((col) => (
                <th key={col.key} className={`px-5 py-3 font-medium ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className={`transition-colors hover:bg-surfaceMuted ${selected.has(row.id) ? "bg-accentSoft/40" : ""}`}>
                {canManage && (
                  <td className="px-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Select ${clientDisplayName(row)}`}
                    />
                  </td>
                )}
                {CLIENT_COLUMNS.map((col) => (
                  <td key={col.key} className={`px-5 py-3.5 ${col.className ?? ""}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
