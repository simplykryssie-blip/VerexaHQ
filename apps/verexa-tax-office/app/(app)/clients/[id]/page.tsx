import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CLIENT_STATUS_LABELS, CLIENT_TYPE_LABELS } from "@/lib/validation/clients";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { ClientContactsTab } from "@/features/clients/client-contacts-tab";
import { ClientNotesTab } from "@/features/clients/client-notes-tab";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: contacts }, { data: engagements }, { data: services }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_contacts").select("*").eq("client_id", id).order("is_primary", { ascending: false }),
    supabase
      .from("tax_engagements")
      .select("id, engagement_number, tax_year, status, title, balance_due")
      .eq("client_id", id)
      .order("tax_year", { ascending: false }),
    supabase.from("services").select("id, name, status").eq("client_id", id),
  ]);

  if (!client) notFound();

  const displayName = client.company || `${client.first_name} ${client.last_name}`.trim();
  const openBalance = (engagements ?? []).reduce((sum, e) => sum + Number(e.balance_due ?? 0), 0);

  return (
    <div className="space-y-4">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to clients
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{CLIENT_TYPE_LABELS[client.client_type]}</Badge>
            <Badge variant="secondary">
              {CLIENT_STATUS_LABELS[client.status as keyof typeof CLIENT_STATUS_LABELS] ?? client.status}
            </Badge>
            <span className="text-xs text-muted-foreground capitalize">Portal: {client.portal_status.replace("_", " ")}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Active services" value={(services ?? []).filter((s) => s.status === "active").length} />
        <MiniStat label="Tax engagements" value={(engagements ?? []).length} />
        <MiniStat label="Open balance" value={formatCurrency(openBalance)} />
        <MiniStat label="Client since" value={formatDate(client.created_at)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="engagements">Tax Engagements</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="more">More</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Field label="Email" value={client.email} />
              <Field label="Phone" value={client.phone} />
              <Field label="Preferred contact method" value={client.preferred_contact_method} />
              <Field label="Preferred language" value={client.preferred_language} />
              <Field label="Date of birth" value={formatDate(client.date_of_birth)} />
              <Field label="SSN (last 4)" value={client.ssn_last4 ? `•••-••-${client.ssn_last4}` : null} />
              <Field label="EIN (last 4)" value={client.ein_last4 ? `••-•••${client.ein_last4}` : null} />
              <Field label="Source" value={client.source} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <ClientContactsTab clientId={client.id} workspaceId={client.workspace_id} contacts={contacts ?? []} />
        </TabsContent>

        <TabsContent value="services">
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent>
              {!services || services.length === 0 ? (
                <p className="text-sm text-muted-foreground">No services on this client yet.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {services.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-2">
                      {s.name}
                      <Badge variant="secondary">{s.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagements">
          <Card>
            <CardHeader>
              <CardTitle>Tax engagements</CardTitle>
            </CardHeader>
            <CardContent>
              {!engagements || engagements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tax engagements for this client yet.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {engagements.map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2">
                      <Link href={`/engagements/${e.id}`} className="hover:underline">
                        {e.engagement_number ?? e.title} · {e.tax_year}
                      </Link>
                      <Badge variant="secondary">{String(e.status).replace(/_/g, " ")}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <ClientNotesTab clientId={client.id} notes={client.notes} />
        </TabsContent>

        <TabsContent value="more">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Household, Intake, Documents, Tasks, Messages, Appointments, Billing, Signatures, and Activity
              tabs land with their respective modules later in this build.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
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
