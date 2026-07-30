import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EngagementStatusSelect } from "@/features/engagements/status-select";
import { engagementStatusLabel } from "@/lib/validation/engagements";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/formatters";
import { getDocuments, getDocumentCategories } from "@/features/documents/queries";
import { DocumentsTable } from "@/features/documents/documents-table";
import { UploadDocumentDialog } from "@/features/documents/upload-dialog";
import { getSignatureRequests } from "@/features/signatures/queries";
import { signatureRequestStatusLabel } from "@/lib/validation/signatures";
import { getInvoices } from "@/features/billing/queries";
import { invoiceStatusLabel } from "@/lib/validation/billing";
import { ReturnReleasePanel } from "@/features/engagements/return-release-panel";
import { EfilePanel } from "@/features/engagements/efile-panel";

export default async function EngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: engagement }, { data: history }] = await Promise.all([
    supabase
      .from("tax_engagements")
      .select("*, client:clients(id, first_name, last_name, company), household:tax_households(id, household_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("engagement_status_history")
      .select("*")
      .eq("engagement_id", id)
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);

  if (!engagement) notFound();
  const client = engagement.client as { id: string; first_name?: string; last_name?: string; company?: string } | null;
  const household = engagement.household as { id: string; household_name?: string } | null;

  const [documents, documentCategories, signatureRequests, invoices, { data: releaseControls }, { data: efileEvents }] = await Promise.all([
    getDocuments(engagement.workspace_id, { engagementId: id }),
    getDocumentCategories(),
    getSignatureRequests(engagement.workspace_id, { engagementId: id }),
    getInvoices(engagement.workspace_id, { engagementId: id }),
    supabase.from("return_release_controls").select("*").eq("engagement_id", id).maybeSingle(),
    supabase.from("efile_events").select("*").eq("engagement_id", id).order("occurred_at", { ascending: true }),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/engagements" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to engagements
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{engagement.engagement_number ?? engagement.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            {client && (
              <Link href={`/clients/${client.id}`} className="hover:underline">
                {client.company || `${client.first_name} ${client.last_name}`}
              </Link>
            )}
            {household && (
              <>
                {" · "}
                <Link href={`/households/${household.id}`} className="hover:underline">
                  {household.household_name}
                </Link>
              </>
            )}
            {" · "} Tax year {engagement.tax_year} · {engagement.return_type}
          </div>
        </div>
        <EngagementStatusSelect engagementId={engagement.id} status={engagement.status} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="signatures">Signatures</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="release">Release</TabsTrigger>
          <TabsTrigger value="efile">E-file</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Field label="Status" value={engagementStatusLabel(engagement.status)} />
              <Field label="Priority" value={titleCase(engagement.priority)} />
              <Field label="Jurisdiction" value={engagement.jurisdiction} />
              <Field label="Engagement type" value={titleCase(engagement.engagement_type)} />
              <Field label="Due date" value={formatDate(engagement.due_date)} />
              <Field label="Internal due date" value={formatDate(engagement.internal_due_date)} />
              <Field label="Extension due date" value={formatDate(engagement.extension_due_date)} />
              <Field label="Payment status" value={titleCase(engagement.payment_status)} />
              <Field label="Balance due" value={formatCurrency(engagement.balance_due)} />
              <Field label="E-file status" value={titleCase(engagement.efile_status)} />
              <Field label="Extension requested" value={engagement.extension_requested ? "Yes" : "No"} />
              <Field label="Extension filed" value={engagement.extension_filed ? "Yes" : "No"} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {!history || history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{titleCase(h.activity_type)}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(h.changed_at)}</span>
                      </div>
                      {h.from_status && h.to_status && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <Badge variant="outline" className="mr-1">
                            {engagementStatusLabel(h.from_status)}
                          </Badge>
                          →
                          <Badge variant="secondary" className="ml-1">
                            {engagementStatusLabel(h.to_status)}
                          </Badge>
                        </div>
                      )}
                      {h.description && <p className="text-xs text-muted-foreground mt-1">{h.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <UploadDocumentDialog workspaceId={engagement.workspace_id} clientId={engagement.client_id} engagementId={engagement.id} categories={documentCategories} />
            </div>
            <DocumentsTable documents={documents} showClient={false} />
          </div>
        </TabsContent>

        <TabsContent value="signatures">
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <Button asChild variant="brand" size="sm">
                <Link href="/signatures/new">New signature request</Link>
              </Button>
            </div>
            {signatureRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No signature requests for this engagement yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {signatureRequests.map((r) => (
                  <li key={r.id} className="p-3 flex items-center justify-between text-sm">
                    <Link href={`/signatures/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <Badge variant="secondary">{signatureRequestStatusLabel(r.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <Button asChild variant="brand" size="sm">
                <Link href="/invoices/new">New invoice</Link>
              </Button>
            </div>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No invoices for this engagement yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {invoices.map((inv) => (
                  <li key={inv.id} className="p-3 flex items-center justify-between text-sm">
                    <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                      {inv.invoice_number}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatCurrency(inv.balance_due)} due</span>
                      <Badge variant="secondary">{invoiceStatusLabel(inv.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="release">
          <ReturnReleasePanel engagementId={engagement.id} initialControls={releaseControls} />
        </TabsContent>

        <TabsContent value="efile">
          <EfilePanel workspaceId={engagement.workspace_id} engagementId={engagement.id} events={efileEvents ?? []} />
        </TabsContent>
      </Tabs>
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
