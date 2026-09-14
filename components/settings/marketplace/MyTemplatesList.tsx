"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Workflow, Copy, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { IconChip } from "@/components/ui/IconChip";

export type InstalledTemplateRow = {
  installation_id: string;
  marketplace_template_id: string;
  marketplace_name: string;
  category: string;
  source_table: "organizer_templates" | "automations";
  copy_id: string;
  name: string;
  copy_status: string;
  installed_version: number;
  current_master_version: number;
  installed_at: string;
  copy_updated_at: string;
  is_customized: boolean;
};

const TYPE_LABEL: Record<InstalledTemplateRow["source_table"], string> = {
  organizer_templates: "Organizer",
  automations: "Workflow",
};

// "Disabled" here means the workspace's own draft/published toggle on this
// copy (set_installed_template_enabled) -- it never touches automations'
// separate is_enabled flag, so re-enabling a workflow template here never
// reactivates live execution on its own; that stays a deliberate, separate
// step on the Workflows page.
const STATUS_TONE: Record<string, BadgeTone> = { published: "success", draft: "neutral" };
const STATUS_LABEL: Record<string, string> = { published: "Active", draft: "Disabled" };

function editHref(row: InstalledTemplateRow) {
  return row.source_table === "organizer_templates" ? `/templates/organizers/${row.copy_id}` : `/workflows/${row.copy_id}`;
}

function Row({ row, workspaceId }: { row: InstalledTemplateRow; workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState<"duplicate" | "toggle" | "delete" | null>(null);
  const Icon = row.source_table === "organizer_templates" ? ClipboardList : Workflow;
  const isEnabled = row.copy_status === "published";
  const updateAvailable = row.installed_version < row.current_master_version;

  async function duplicate() {
    setBusy("duplicate");
    const { error } = await supabase.rpc("duplicate_installed_template", {
      p_workspace_id: workspaceId,
      p_installation_id: row.installation_id,
      p_new_name: `${row.name} (Copy)`,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`${row.name} duplicated`, "success");
    router.refresh();
  }

  async function toggleEnabled() {
    setBusy("toggle");
    const { error } = await supabase.rpc("set_installed_template_enabled", {
      p_workspace_id: workspaceId,
      p_installation_id: row.installation_id,
      p_enabled: !isEnabled,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${row.name}"? Verexa's master template is never affected -- you can reinstall a clean copy from the Marketplace anytime.`)) return;
    setBusy("delete");
    const { error } = await supabase.rpc("delete_installed_template", {
      p_workspace_id: workspaceId,
      p_installation_id: row.installation_id,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`${row.name} deleted`, "success");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <IconChip tone="violet">
        <Icon size={16} aria-hidden="true" />
      </IconChip>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-medium text-ink">{row.name}</h3>
          {row.is_customized && <Badge tone="accent">Customized</Badge>}
          {updateAvailable && <Badge tone="warning">Update available</Badge>}
        </div>
        <p className="text-xs text-muted">
          {row.category} &middot; {TYPE_LABEL[row.source_table]} &middot; v{row.installed_version} &middot; installed{" "}
          {new Date(row.installed_at).toLocaleDateString()}
        </p>
      </div>
      <Badge tone={STATUS_TONE[row.copy_status] ?? "neutral"}>{STATUS_LABEL[row.copy_status] ?? row.copy_status}</Badge>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={editHref(row)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate hover:border-accent hover:text-accent">
          Open
        </Link>
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={busy !== null}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {isEnabled ? "Disable" : "Enable"}
        </button>
        <button
          type="button"
          onClick={duplicate}
          disabled={busy !== null}
          aria-label={`Duplicate ${row.name}`}
          className="rounded p-1.5 text-muted transition hover:bg-accentSoft hover:text-accent disabled:opacity-50"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy !== null}
          aria-label={`Delete ${row.name}`}
          className="rounded p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export function MyTemplatesList({ workspaceId, templates }: { workspaceId: string; templates: InstalledTemplateRow[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      {templates.map((row) => (
        <Row key={row.installation_id} row={row} workspaceId={workspaceId} />
      ))}
    </div>
  );
}
