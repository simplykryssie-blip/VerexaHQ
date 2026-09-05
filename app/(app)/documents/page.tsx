import Link from "next/link";
import { FileText, Clock, AlertTriangle, PenLine, HardDrive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { buildEntityLabelMap } from "@/lib/documentEntityLabels";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { AllDocumentsPanel } from "@/components/documents/AllDocumentsPanel";
import { StatTile } from "@/components/ui/StatTile";
import type { IconChipTone } from "@/components/ui/IconChip";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatCard({
  icon,
  chip = "accent",
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  chip?: IconChipTone;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const body = <StatTile icon={icon} tone={chip} label={label} value={value} />;
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DocumentCenterHubPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "documents.view" });
  if (!canView) {
    return (
      <>
        <PageHeader title="Document Center" />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to view the Document Center." />
        </div>
      </>
    );
  }

  const [{ data: openRequests }, { data: pendingSignatures }, { data: allDocuments }, { data: allFolders }, { data: storageRows }, staffMembers] = await Promise.all([
    supabase
      .from("document_requests")
      .select(
        `id, title, due_date, entity_type, entity_id,
        items:document_request_item_statuses(id, is_required, status)`
      )
      .eq("workspace_id", workspace.id)
      .eq("status", "open"),
    supabase
      .from("signature_requests")
      .select(
        `id, title, due_date, created_at,
        attachment:attachments!signature_requests_attachment_id_fkey(file_name)`
      )
      .eq("workspace_id", workspace.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select(
        `id, file_name, storage_path, category, tags, version, mime_type, file_size_bytes, folder_id,
        is_favorite, is_archived, is_locked, visibility, created_at, uploaded_by, entity_type, entity_id`
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("document_folders").select("id, name, parent_folder_id, display_order, entity_type, entity_id").eq("workspace_id", workspace.id),
    supabase.from("attachments").select("file_size_bytes").eq("workspace_id", workspace.id).eq("is_archived", false),
    getWorkspaceStaff(supabase, workspace.id),
  ]);

  const labelMap = await buildEntityLabelMap(supabase, [...(openRequests ?? []), ...(allDocuments ?? []), ...(allFolders ?? [])]);

  const staffById = new Map(staffMembers.map((m) => [m.user_id, { id: m.user_id, display_name: m.display_name }]));
  const documentsWithUploader = (allDocuments ?? []).map((d: any) => ({
    ...d,
    uploaded_by: d.uploaded_by ? staffById.get(d.uploaded_by) ?? null : null,
  }));

  const missingDocuments = (openRequests ?? []).reduce(
    (sum, r) => sum + (r.items ?? []).filter((i) => i.is_required && i.status === "pending").length,
    0
  );
  const overdueRequests = (openRequests ?? []).filter((r) => r.due_date && new Date(r.due_date) < new Date());
  const totalStorage = (storageRows ?? []).reduce((sum, a) => sum + (a.file_size_bytes ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Document Center"
        description="Pending requests, signatures, and storage across every client and engagement -- for analysis, see Reports > Documents."
        actions={
          <Link href="/reports/documents" className="text-sm font-medium text-accent hover:underline">
            View Reports &rarr;
          </Link>
        }
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={FileText} chip="accent" label="Pending requests" value={(openRequests ?? []).length} href="/reports/documents?report=completion" />
          <StatCard icon={AlertTriangle} chip="rose" label="Missing documents" value={missingDocuments} href="/reports/documents?report=missing" />
          <StatCard icon={Clock} chip="amber" label="Overdue requests" value={overdueRequests.length} href="/reports/documents?report=missing" />
          <StatCard icon={PenLine} chip="violet" label="Pending signatures" value={(pendingSignatures ?? []).length} href="/reports/documents?report=signatures" />
          <StatCard icon={HardDrive} chip="emerald" label="Storage used" value={formatSize(totalStorage)} href="/reports/documents?report=storage" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-surface shadow-soft">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">Pending requests</h2>
            {(openRequests ?? []).length === 0 ? (
              <EmptyState message="No open document requests." />
            ) : (
              <ul className="divide-y divide-border">
                {(openRequests ?? []).slice(0, 8).map((r) => {
                  const entity = labelMap.get(`${r.entity_type}:${r.entity_id}`);
                  const missing = (r.items ?? []).filter((i) => i.is_required && i.status === "pending").length;
                  const overdue = Boolean(r.due_date && new Date(r.due_date) < new Date());
                  return (
                    <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-surfaceMuted">
                      <div>
                        <Link href={entity?.href ?? "#"} className="font-medium text-accent hover:underline">
                          {entity?.label ?? "--"}
                        </Link>
                        <p className="text-xs text-muted">{r.title}</p>
                      </div>
                      <Badge tone={overdue ? "danger" : missing > 0 ? "warning" : "neutral"}>
                        {missing} missing{r.due_date && ` -- due ${new Date(r.due_date).toLocaleDateString()}`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface shadow-soft">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">Pending signatures</h2>
            {(pendingSignatures ?? []).length === 0 ? (
              <EmptyState message="No pending signature requests." />
            ) : (
              <ul className="divide-y divide-border">
                {(pendingSignatures ?? []).slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate">{r.title}</p>
                      <p className="text-xs text-muted">{r.attachment?.file_name ?? "Document"}</p>
                    </div>
                    <span className="text-xs text-muted">{r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : "No due date"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink">All documents</h2>
          <AllDocumentsPanel workspaceId={workspace.id} documents={documentsWithUploader as never} folders={(allFolders ?? []) as never} entityLabels={labelMap} />
        </div>
      </div>
    </>
  );
}
