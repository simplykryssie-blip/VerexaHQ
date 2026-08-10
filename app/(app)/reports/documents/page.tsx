import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable } from "@/components/reports/SortableTable";
import { buildReportTable, type ReportColumnDef } from "@/lib/reports/buildReportTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { EmptyState } from "@/components/EmptyState";
import { buildEntityLabelMap } from "@/lib/documentEntityLabels";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "missing", label: "Missing Documents" },
  { key: "uploads", label: "Upload Activity" },
  { key: "signatures", label: "Signatures" },
  { key: "storage", label: "Storage" },
  { key: "completion", label: "Request Completion" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function DocumentsReportPage({
  searchParams,
}: {
  searchParams: { report?: string; q?: string; from?: string; to?: string };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "documents.view" });
  if (!canView) {
    return (
      <ReportLayout title="Documents">
        <EmptyState icon={Lock} message="You don't have permission to view document reports." />
      </ReportLayout>
    );
  }

  const activeTab: TabKey = TABS.some((t) => t.key === searchParams.report) ? (searchParams.report as TabKey) : "missing";
  const q = searchParams.q?.toLowerCase();

  const tabNav = (
    <nav className="flex gap-1 border-b border-border print:hidden">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/reports/documents?report=${t.key}`}
          className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (activeTab === "missing") {
    const { data: requests } = await supabase
      .from("document_requests")
      .select(
        `id, title, due_date, status, entity_type, entity_id,
        items:document_request_item_statuses(id, is_required, status)`
      )
      .eq("workspace_id", workspace.id)
      .eq("status", "open");

    const labelMap = await buildEntityLabelMap(supabase, requests ?? []);

    type Row = { id: string; title: string; entityLabel: string; href: string; missing: number; dueDate: string | null; overdue: boolean };
    let rows: Row[] = (requests ?? []).map((r: any) => {
      const missing = (r.items ?? []).filter((i: any) => i.is_required && i.status === "pending").length;
      const entity = labelMap.get(`${r.entity_type}:${r.entity_id}`);
      return {
        id: r.id,
        title: r.title,
        entityLabel: entity?.label ?? "--",
        href: entity?.href ?? "#",
        missing,
        dueDate: r.due_date,
        overdue: Boolean(r.due_date && new Date(r.due_date) < new Date()),
      };
    });
    rows = rows.filter((r) => r.missing > 0);
    if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.entityLabel.toLowerCase().includes(q));

    const columnDefs: ReportColumnDef<Row>[] = [
      {
        key: "entity",
        label: "Client / Engagement",
        render: (r) => (
          <Link href={r.href} className="font-medium text-accent hover:underline">
            {r.entityLabel}
          </Link>
        ),
        sortValue: (r) => r.entityLabel,
      },
      { key: "title", label: "Request", render: (r) => r.title, sortValue: (r) => r.title },
      { key: "missing", label: "Missing", align: "right", render: (r) => r.missing, sortValue: (r) => r.missing },
      {
        key: "due",
        label: "Due",
        render: (r) => (r.dueDate ? <span className={r.overdue ? "text-danger" : undefined}>{new Date(r.dueDate).toLocaleDateString()}</span> : "--"),
        sortValue: (r) => r.dueDate ?? "",
      },
    ];
    const { columns, tableRows } = buildReportTable(rows, columnDefs);
    const csvRows = rows.map((r) => ({ Entity: r.entityLabel, Request: r.title, Missing: r.missing, Due: r.dueDate ?? "" }));

    return (
      <ReportLayout
        title="Documents"
        description="Open document requests with required items still pending, from live request data."
        filters={
          <div className="space-y-3">
            {tabNav}
            <FilterBar reportKey="documents-missing" showDateRange={false} searchPlaceholder="Search request or client..." />
          </div>
        }
        actions={<ExportButtons rows={csvRows} filename="missing-documents-report" />}
      >
        <SortableTable columns={columns} rows={tableRows} emptyMessage="No open requests have missing required documents." />
      </ReportLayout>
    );
  }

  if (activeTab === "uploads") {
    let query = supabase
      .from("attachments")
      .select("id, file_name, category, entity_type, entity_id, uploaded_by, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(300);
    if (searchParams.from) query = query.gte("created_at", searchParams.from);
    if (searchParams.to) query = query.lte("created_at", searchParams.to);
    const { data: attachments } = await query;

    const [labelMap, { data: staffMembers }] = await Promise.all([
      buildEntityLabelMap(supabase, attachments ?? []),
      supabase.from("workspace_users").select("user_id, user_profiles(id, display_name)").eq("workspace_id", workspace.id),
    ]);
    const staffById = new Map((staffMembers ?? []).map((m: any) => [m.user_id, m.user_profiles?.display_name as string | null]));

    type Row = { id: string; fileName: string; entityLabel: string; href: string; uploadedBy: string; category: string; createdAt: string };
    let rows: Row[] = (attachments ?? []).map((a: any) => {
      const entity = labelMap.get(`${a.entity_type}:${a.entity_id}`);
      return {
        id: a.id,
        fileName: a.file_name,
        entityLabel: entity?.label ?? "--",
        href: entity?.href ?? "#",
        uploadedBy: (a.uploaded_by && staffById.get(a.uploaded_by)) || "Unknown",
        category: a.category ?? "--",
        createdAt: a.created_at,
      };
    });
    if (q) rows = rows.filter((r) => r.fileName.toLowerCase().includes(q) || r.entityLabel.toLowerCase().includes(q));

    const columnDefs: ReportColumnDef<Row>[] = [
      { key: "file", label: "File", render: (r) => r.fileName, sortValue: (r) => r.fileName },
      {
        key: "entity",
        label: "Client / Engagement",
        render: (r) => (
          <Link href={r.href} className="font-medium text-accent hover:underline">
            {r.entityLabel}
          </Link>
        ),
        sortValue: (r) => r.entityLabel,
      },
      { key: "uploader", label: "Uploaded by", render: (r) => r.uploadedBy, sortValue: (r) => r.uploadedBy },
      { key: "category", label: "Category", render: (r) => r.category, sortValue: (r) => r.category },
      { key: "date", label: "Uploaded", render: (r) => new Date(r.createdAt).toLocaleString(), sortValue: (r) => r.createdAt },
    ];
    const { columns, tableRows } = buildReportTable(rows, columnDefs);
    const csvRows = rows.map((r) => ({ File: r.fileName, Entity: r.entityLabel, "Uploaded by": r.uploadedBy, Category: r.category, Uploaded: r.createdAt }));

    return (
      <ReportLayout
        title="Documents"
        description="Most recent 300 uploads across the workspace."
        filters={
          <div className="space-y-3">
            {tabNav}
            <FilterBar reportKey="documents-uploads" searchPlaceholder="Search file or client..." />
          </div>
        }
        actions={<ExportButtons rows={csvRows} filename="upload-activity-report" />}
      >
        <SortableTable columns={columns} rows={tableRows} emptyMessage="No uploads in this range." />
      </ReportLayout>
    );
  }

  if (activeTab === "signatures") {
    const { data: requests } = await supabase
      .from("signature_requests")
      .select(
        `id, title, status, due_date, created_at,
        attachment:attachments!signature_requests_attachment_id_fkey(file_name),
        signers:signature_request_signers(id, status)`
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });

    type Row = { id: string; title: string; document: string; status: string; signed: number; total: number; dueDate: string | null };
    let rows: Row[] = (requests ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      document: r.attachment?.file_name ?? "Document",
      status: r.status,
      signed: (r.signers ?? []).filter((s: any) => s.status === "signed").length,
      total: (r.signers ?? []).length,
      dueDate: r.due_date,
    }));
    if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.document.toLowerCase().includes(q));

    const columnDefs: ReportColumnDef<Row>[] = [
      { key: "title", label: "Request", render: (r) => r.title, sortValue: (r) => r.title },
      { key: "document", label: "Document", render: (r) => r.document, sortValue: (r) => r.document },
      { key: "status", label: "Status", render: (r) => <span className="capitalize">{r.status}</span>, sortValue: (r) => r.status },
      { key: "signers", label: "Signed", align: "right", render: (r) => `${r.signed} / ${r.total}`, sortValue: (r) => r.signed },
      { key: "due", label: "Due", render: (r) => (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "--"), sortValue: (r) => r.dueDate ?? "" },
    ];
    const { columns, tableRows } = buildReportTable(rows, columnDefs);
    const csvRows = rows.map((r) => ({ Request: r.title, Document: r.document, Status: r.status, Signed: `${r.signed}/${r.total}`, Due: r.dueDate ?? "" }));

    return (
      <ReportLayout
        title="Documents"
        description="All signature requests across the workspace."
        filters={
          <div className="space-y-3">
            {tabNav}
            <FilterBar reportKey="documents-signatures" showDateRange={false} searchPlaceholder="Search request or document..." />
          </div>
        }
        actions={<ExportButtons rows={csvRows} filename="signature-report" />}
      >
        <SortableTable columns={columns} rows={tableRows} emptyMessage="No signature requests yet." />
      </ReportLayout>
    );
  }

  if (activeTab === "storage") {
    const { data: attachments } = await supabase
      .from("attachments")
      .select("category, file_size_bytes, is_archived")
      .eq("workspace_id", workspace.id);

    const byCategory = new Map<string, { count: number; bytes: number }>();
    let totalBytes = 0;
    let totalCount = 0;
    for (const a of attachments ?? []) {
      const key = a.category ?? "Uncategorized";
      const entry = byCategory.get(key) ?? { count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += a.file_size_bytes ?? 0;
      byCategory.set(key, entry);
      totalBytes += a.file_size_bytes ?? 0;
      totalCount += 1;
    }

    type Row = { id: string; category: string; count: number; bytes: number };
    let rows: Row[] = Array.from(byCategory.entries()).map(([category, v]) => ({ id: category, category, count: v.count, bytes: v.bytes }));
    if (q) rows = rows.filter((r) => r.category.toLowerCase().includes(q));

    const columnDefs: ReportColumnDef<Row>[] = [
      { key: "category", label: "Category", render: (r) => r.category, sortValue: (r) => r.category },
      { key: "count", label: "Documents", align: "right", render: (r) => r.count, sortValue: (r) => r.count },
      { key: "size", label: "Storage used", align: "right", render: (r) => formatSize(r.bytes), sortValue: (r) => r.bytes },
    ];
    const { columns, tableRows } = buildReportTable(rows, columnDefs);
    const csvRows = rows.map((r) => ({ Category: r.category, Documents: r.count, "Storage used": formatSize(r.bytes) }));

    return (
      <ReportLayout
        title="Documents"
        description={`Total storage used across the workspace: ${formatSize(totalBytes)} across ${totalCount} documents.`}
        filters={
          <div className="space-y-3">
            {tabNav}
            <FilterBar reportKey="documents-storage" showDateRange={false} searchPlaceholder="Search category..." />
          </div>
        }
        actions={<ExportButtons rows={csvRows} filename="storage-report" />}
      >
        <SortableTable columns={columns} rows={tableRows} emptyMessage="No documents uploaded yet." />
      </ReportLayout>
    );
  }

  // completion
  const { data: requests } = await supabase
    .from("document_requests")
    .select(
      `id, title, status, due_date, created_at, entity_type, entity_id,
      items:document_request_item_statuses(id, status)`
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const labelMap = await buildEntityLabelMap(supabase, requests ?? []);

  type Row = { id: string; title: string; entityLabel: string; href: string; status: string; pct: number; dueDate: string | null };
  let rows: Row[] = (requests ?? []).map((r: any) => {
    const items = r.items ?? [];
    const done = items.filter((i: any) => i.status !== "pending").length;
    const pct = items.length === 0 ? 100 : Math.round((done / items.length) * 100);
    const entity = labelMap.get(`${r.entity_type}:${r.entity_id}`);
    return {
      id: r.id,
      title: r.title,
      entityLabel: entity?.label ?? "--",
      href: entity?.href ?? "#",
      status: r.status,
      pct,
      dueDate: r.due_date,
    };
  });
  if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.entityLabel.toLowerCase().includes(q));

  const columnDefs: ReportColumnDef<Row>[] = [
    {
      key: "entity",
      label: "Client / Engagement",
      render: (r) => (
        <Link href={r.href} className="font-medium text-accent hover:underline">
          {r.entityLabel}
        </Link>
      ),
      sortValue: (r) => r.entityLabel,
    },
    { key: "title", label: "Request", render: (r) => r.title, sortValue: (r) => r.title },
    { key: "status", label: "Status", render: (r) => <span className="capitalize">{r.status}</span>, sortValue: (r) => r.status },
    { key: "pct", label: "Completion", align: "right", render: (r) => `${r.pct}%`, sortValue: (r) => r.pct },
    { key: "due", label: "Due", render: (r) => (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "--"), sortValue: (r) => r.dueDate ?? "" },
  ];
  const { columns, tableRows } = buildReportTable(rows, columnDefs);
  const csvRows = rows.map((r) => ({ Entity: r.entityLabel, Request: r.title, Status: r.status, "Completion %": r.pct, Due: r.dueDate ?? "" }));

  return (
    <ReportLayout
      title="Documents"
      description="Completion percentage for every document request, open or closed."
      filters={
        <div className="space-y-3">
          {tabNav}
          <FilterBar reportKey="documents-completion" showDateRange={false} searchPlaceholder="Search request or client..." />
        </div>
      }
      actions={<ExportButtons rows={csvRows} filename="request-completion-report" />}
    >
      <SortableTable columns={columns} rows={tableRows} emptyMessage="No document requests yet." />
    </ReportLayout>
  );
}
