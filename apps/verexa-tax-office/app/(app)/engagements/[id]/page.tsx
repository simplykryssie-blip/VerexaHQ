import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EngagementStatusSelect } from "@/features/engagements/status-select";
import { engagementStatusLabel } from "@/lib/validation/engagements";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/formatters";

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
          <TabsTrigger value="more">More</TabsTrigger>
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

        <TabsContent value="more">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Organizer, Documents, Document Requests, Preparation, Review, Tasks, Messages, Billing,
              Signatures, and E-file History tabs land with their respective modules later in this build.
            </CardContent>
          </Card>
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
