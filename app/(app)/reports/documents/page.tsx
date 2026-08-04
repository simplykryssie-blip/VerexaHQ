import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable, type ReportColumn } from "@/components/reports/SortableTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  engagementNumber: string | null;
  clientId: string;
  clientLabel: string;
  serviceName: string;
  requested: number;
  uploaded: number;
  missing: number;
};

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return "--";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function DocumentsReportPage({ searchParams }: { searchParams: { q?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "documents.view" });
  if (!canView) {
    return (
      <ReportLayout title="Documents">
        <EmptyState message="You don't have permission to view document reports." />
      </ReportLayout>
    );
  }

  const { data: engagements } = await supabase
    .from("engagements")
    .select(
      "id, engagement_number, service_id, client_id, clients(first_name, last_name, business_name, client_type), services(id, name, document_request_template_id)"
    )
    .eq("workspace_id", workspace.id)
    .not("status", "in", '("Completed","Archived")')
    .not("service_id", "is", null);

  const engagementsWithTemplate = (engagements ?? []).filter(
    (e) => (e.services as unknown as { document_request_template_id: string | null } | null)?.document_request_template_id
  );

  const templateIds = Array.from(
    new Set(
      engagementsWithTemplate
        .map((e) => (e.services as unknown as { document_request_template_id: string | null }).document_request_template_id)
        .filter((v): v is string => Boolean(v))
    )
  );
  const engagementIds = engagementsWithTemplate.map((e) => e.id);

  const [{ data: requestCounts }, { data: attachments }] = await Promise.all([
    templateIds.length > 0
      ? supabase.from("document_request_items").select("document_request_template_id").in("document_request_template_id", templateIds)
      : Promise.resolve({ data: [] as { document_request_template_id: string }[] }),
    engagementIds.length > 0
      ? supabase.from("attachments").select("entity_id").eq("entity_type", "engagement").in("entity_id", engagementIds)
      : Promise.resolve({ data: [] as { entity_id: string }[] }),
  ]);

  const requestedByTemplate = new Map<string, number>();
  for (const r of requestCounts ?? []) {
    requestedByTemplate.set(r.document_request_template_id, (requestedByTemplate.get(r.document_request_template_id) ?? 0) + 1);
  }
  const uploadedByEngagement = new Map<string, number>();
  for (const a of attachments ?? []) {
    uploadedByEngagement.set(a.entity_id, (uploadedByEngagement.get(a.entity_id) ?? 0) + 1);
  }

  let rows: Row[] = engagementsWithTemplate.map((e) => {
    const service = e.services as unknown as { name: string; document_request_template_id: string };
    const requested = requestedByTemplate.get(service.document_request_template_id) ?? 0;
    const uploaded = uploadedByEngagement.get(e.id) ?? 0;
    return {
      id: e.id,
      engagementNumber: e.engagement_number,
      clientId: e.client_id,
      clientLabel: clientLabel(e.clients as never),
      serviceName: service.name,
      requested,
      uploaded,
      missing: Math.max(requested - uploaded, 0),
    };
  });

  rows = rows.filter((r) => r.missing > 0);
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    rows = rows.filter((r) => r.clientLabel.toLowerCase().includes(q) || r.engagementNumber?.toLowerCase().includes(q));
  }

  const columns: ReportColumn<Row>[] = [
    {
      key: "client",
      label: "Client",
      render: (r) => (
        <Link href={`/clients/${r.clientId}`} className="font-medium text-accent hover:underline">
          {r.clientLabel}
        </Link>
      ),
      sortValue: (r) => r.clientLabel,
    },
    { key: "engagement", label: "Engagement", render: (r) => r.engagementNumber ?? "--", sortValue: (r) => r.engagementNumber ?? "" },
    { key: "service", label: "Service", render: (r) => r.serviceName, sortValue: (r) => r.serviceName },
    { key: "requested", label: "Requested", align: "right", render: (r) => r.requested, sortValue: (r) => r.requested },
    { key: "uploaded", label: "Uploaded", align: "right", render: (r) => r.uploaded, sortValue: (r) => r.uploaded },
    { key: "missing", label: "Missing", align: "right", render: (r) => r.missing, sortValue: (r) => r.missing },
  ];

  const csvRows = rows.map((r) => ({
    Client: r.clientLabel,
    Engagement: r.engagementNumber ?? "",
    Service: r.serviceName,
    Requested: r.requested,
    Uploaded: r.uploaded,
    Missing: r.missing,
  }));

  return (
    <ReportLayout
      title="Missing Documents"
      description="Best-effort estimate: requested-via-service-template counts vs. uploaded attachments -- there's no field tying a specific attachment to a specific requested item."
      filters={<FilterBar reportKey="documents" showDateRange={false} searchPlaceholder="Search client or engagement..." />}
      actions={<ExportButtons rows={csvRows} filename="missing-documents-report" />}
    >
      <SortableTable columns={columns} rows={rows} emptyMessage="No engagements are missing requested documents." />
    </ReportLayout>
  );
}
