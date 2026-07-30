import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadFormDialog } from "@/features/leads/lead-form-dialog";
import { ConvertLeadButton } from "@/features/leads/convert-lead-button";
import { LEAD_STATUS_LABELS } from "@/lib/validation/leads";
import { formatCurrency, formatDateTime } from "@/lib/formatters";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lead.first_name} {lead.last_name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{LEAD_STATUS_LABELS[lead.status]}</Badge>
            {lead.company && <span className="text-sm text-muted-foreground">{lead.company}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LeadFormDialog workspaceId={lead.workspace_id} lead={lead} trigger={<Button variant="outline">Edit</Button>} />
          <ConvertLeadButton leadId={lead.id} alreadyConverted={!!lead.converted_client_id} />
        </div>
      </div>

      {lead.converted_client_id && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 text-sm">
            This lead has been converted.{" "}
            <Link href={`/clients/${lead.converted_client_id}`} className="text-primary font-medium hover:underline">
              View client
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="Email" value={lead.email} />
          <Field label="Phone" value={lead.phone} />
          <Field label="Source" value={lead.source} />
          <Field label="Services of interest" value={lead.service_interest} />
          <Field label="Estimated value" value={formatCurrency(lead.estimated_value)} />
          <Field label="Follow-up / consultation" value={formatDateTime(lead.consultation_at)} />
          <Field label="Created" value={formatDateTime(lead.created_at)} />
          {lead.lost_reason && <Field label="Lost reason" value={lead.lost_reason} />}
        </CardContent>
      </Card>

      {lead.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{lead.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}
