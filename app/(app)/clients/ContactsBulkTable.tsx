"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Download, X, UserCog, Tags as TagsIcon, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { ensureTagConfirmed } from "@/lib/ensureTag";
import { CLIENT_COLUMNS, clientDisplayName, type ClientRow } from "./clientListColumns";
import { BULK_STATUS_OPTIONS, partitionForBulkStatus, tagsAfterBulkRemove, rowsHavingTag, type BulkStatusValue } from "./bulkContactActions";

type StaffOption = { value: string; label: string };

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

// Tag add/remove, export, status, and assignment -- not the full original
// wishlist (send template / create engagement / archive / restore). Those
// remaining actions each carry edge cases a bulk no-questions-asked loop
// risked getting wrong: a template needs per-recipient merge fields, an
// engagement needs a service picked, and archive/restore have no existing
// single-client mechanism anywhere in the app to safely generalize (see
// bulk-fix audit notes) -- "lost" specifically is excluded from bulk status
// for the same reason: it has real cascading side effects (mark_client_lost
// voids invoices, archives engagements, cancels document requests) that a
// condensed bulk flow would risk silently skipping or under-communicating.
// Tag/export/status/assignment are all direct column writes with no
// side effects, safe to batch as independent per-row mutations.
export function ContactsBulkTable({
  rows,
  workspaceId,
  canManage,
  canEdit,
  staffOptions,
  emptyMessage,
  emptyAction,
}: {
  rows: ClientRow[];
  workspaceId: string;
  canManage: boolean;
  /** Gates bulk status/assignment -- clients.edit, the same permission
   * mark_client_lost and the single-client assignment form already require,
   * since these mutate existing contacts rather than create new ones. */
  canEdit: boolean;
  staffOptions: StaffOption[];
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
  const [removeTagInput, setRemoveTagInput] = useState("");
  const [removingTag, setRemovingTag] = useState(false);
  const [removeTagOpen, setRemoveTagOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [applyingStatus, setApplyingStatus] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [applyingAssign, setApplyingAssign] = useState(false);

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

  async function removeTag() {
    const tag = removeTagInput.trim();
    if (!tag) return;

    const affected = rowsHavingTag(selectedRows, tag);
    if (affected.length === 0) {
      toast.show(`None of the selected contacts have "${tag}"`, "error");
      setRemoveTagInput("");
      setRemoveTagOpen(false);
      return;
    }

    setRemovingTag(true);
    const results = await Promise.all(
      affected.map((row) => supabase.from("clients").update({ tags: tagsAfterBulkRemove(row.tags, tag) }).eq("id", row.id))
    );
    setRemovingTag(false);
    const failed = results.filter((r) => r.error).length;
    if (failed > 0) toast.show(`Removed "${tag}" from ${affected.length - failed} of ${affected.length} contacts -- ${failed} failed`, "error");
    else toast.show(`Removed "${tag}" from ${affected.length} contact${affected.length === 1 ? "" : "s"}`, "success");

    setRemoveTagInput("");
    setRemoveTagOpen(false);
    setSelected(new Set());
    router.refresh();
  }

  async function applyStatus(target: BulkStatusValue) {
    const { eligible, skipped } = partitionForBulkStatus(selectedRows);
    setStatusOpen(false);
    if (eligible.length === 0) {
      toast.show("None of the selected contacts can have their status changed here (already Lost or Archived)", "error");
      return;
    }

    setApplyingStatus(true);
    const results = await Promise.all(
      eligible.map((row) => supabase.from("clients").update({ lifecycle_status: target }).eq("id", row.id))
    );
    setApplyingStatus(false);
    const failed = results.filter((r) => r.error).length;
    const label = BULK_STATUS_OPTIONS.find((o) => o.value === target)?.label ?? target;
    const skippedNote = skipped.length > 0 ? ` (${skipped.length} skipped -- Lost/Archived contacts aren't changed here)` : "";
    if (failed > 0) toast.show(`Set ${eligible.length - failed} of ${eligible.length} to ${label} -- ${failed} failed${skippedNote}`, "error");
    else toast.show(`Set ${eligible.length} contact${eligible.length === 1 ? "" : "s"} to ${label}${skippedNote}`, "success");

    setSelected(new Set());
    router.refresh();
  }

  async function applyAssignment(staffId: string | null) {
    setAssignOpen(false);
    setApplyingAssign(true);
    const results = await Promise.all(
      selectedRows.map((row) => supabase.from("clients").update({ relationship_manager_id: staffId }).eq("id", row.id))
    );
    setApplyingAssign(false);
    const failed = results.filter((r) => r.error).length;
    const label = staffId ? staffOptions.find((s) => s.value === staffId)?.label ?? "staff" : "Unassigned";
    if (failed > 0) toast.show(`Assigned ${selectedRows.length - failed} of ${selectedRows.length} to ${label} -- ${failed} failed`, "error");
    else toast.show(`Assigned ${selectedRows.length} contact${selectedRows.length === 1 ? "" : "s"} to ${label}`, "success");

    setSelected(new Set());
    router.refresh();
  }

  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} action={emptyAction} />;
  }

  return (
    <div>
      {(canManage || canEdit) && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accentSoft px-5 py-2.5">
          <span className="text-xs font-medium text-accent">
            {selected.size} selected
          </span>
          {canManage && (
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
          )}
          {canManage && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setRemoveTagOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-surface px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
              >
                <TagsIcon size={13} /> Remove tag
              </button>
              {removeTagOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 flex w-64 items-center gap-1.5 rounded-lg border border-border bg-surface p-2 shadow-lg">
                  <input
                    autoFocus
                    value={removeTagInput}
                    onChange={(e) => setRemoveTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void removeTag();
                    }}
                    placeholder="Tag name..."
                    className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => void removeTag()}
                    disabled={!removeTagInput.trim() || removingTag}
                    className="shrink-0 rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                  >
                    {removingTag ? "..." : "Remove"}
                  </button>
                </div>
              )}
            </div>
          )}
          {canEdit && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setStatusOpen((o) => !o)}
                disabled={applyingStatus}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-surface px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-60"
              >
                {applyingStatus ? "..." : "Set status"} <ChevronDown size={12} />
              </button>
              {statusOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg">
                  {BULK_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => void applyStatus(opt.value)}
                      className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate hover:bg-surfaceMuted"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canEdit && staffOptions.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAssignOpen((o) => !o)}
                disabled={applyingAssign}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-surface px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-60"
              >
                <UserCog size={13} /> {applyingAssign ? "..." : "Assign to"} <ChevronDown size={12} />
              </button>
              {assignOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => void applyAssignment(null)}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate hover:bg-surfaceMuted"
                  >
                    Unassigned
                  </button>
                  {staffOptions.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => void applyAssignment(s.value)}
                      className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs text-slate hover:bg-surfaceMuted"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => downloadCsv(selectedRows)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-surface px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
            >
              <Download size={13} /> Export CSV
            </button>
          )}
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
              {(canManage || canEdit) && (
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
                {(canManage || canEdit) && (
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
