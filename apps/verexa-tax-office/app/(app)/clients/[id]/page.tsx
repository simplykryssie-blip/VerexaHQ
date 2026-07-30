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
import { ClientActivityTab } from "@/features/clients/client-activity-tab";
import { ClientCommunicationPreferences } from "@/features/clients/communication-preferences";
import { PortalInviteButton } from "@/features/clients/portal-invite-button";
import { AssignOrganizerDialog } from "@/features/intake/assign-organizer-dialog";
import { getOrganizerTemplates, getIntakeSubmissionsForWorkspace } from "@/features/intake/queries";
import { getDocuments, getDocumentCategories } from "@/features/documents/queries";
import { DocumentsTable } from "@/features/documents/documents-table";
import { UploadDocumentDialog } from "@/features/documents/upload-dialog";
import { getTasks } from "@/features/tasks/queries";
import { TaskListView } from "@/features/tasks/task-views";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { intakeStatusLabel } from "@/lib/validation/intake";
import type { PickerOption } from "@/features/engagements/client-picker";

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

  const [intakeSubmissions, organizerTemplates, documents, documentCategories, tasks, { data: staffMembers }, { data: communicationPreferences }] = await Promise.all([
    getIntakeSubmissionsForWorkspace(client.workspace_id, { clientId: id }),
    getOrganizerTemplates(client.workspace_id),
    getDocuments(client.workspace_id, { clientId: id }),
    getDocumentCategories(),
    getTasks(client.workspace_id, { clientId: id }),
    supabase
      .from("workspace_members")
      .select("user_id, profile:user_profiles(display_name, first_name, last_name)")
      .eq("workspace_id", client.workspace_id)
      .eq("status", "active"),
    supabase.from("client_communication_preferences").select("*").eq("client_id", id).maybeSingle(),
  ]);

  const staffOptions: PickerOption[] = (staffMembers ?? []).map((s) => {
    const profile = s.profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
    return { id: s.user_id, label: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Team member" };
  });

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
        <PortalInviteButton clientId={client.id} portalStatus={client.portal_status} hasEmail={!!client.email} />
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
          <TabsTrigger value="intake">Intake</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
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

        <TabsContent value="contacts" className="space-y-4">
          <ClientContactsTab clientId={client.id} workspaceId={client.workspace_id} contacts={contacts ?? []} />
          <ClientCommunicationPreferences workspaceId={client.workspace_id} clientId={client.id} preferences={communicationPreferences} />
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

        <TabsContent value="intake">
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <AssignOrganizerDialog workspaceId={client.workspace_id} templates={organizerTemplates} fixedClientId={client.id} />
            </div>
            {intakeSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No intake organizers assigned to this client yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {intakeSubmissions.map((s) => {
                  const template = s.template as { name?: string } | null;
                  return (
                    <li key={s.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                      <Link href={`/intake/${s.id}`} className="font-medium hover:underline">
                        {template?.name ?? "Intake organizer"}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{intakeStatusLabel(s.status)}</Badge>
                        <span className="text-xs text-muted-foreground">{Math.round(Number(s.progress_percent ?? 0))}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <UploadDocumentDialog workspaceId={client.workspace_id} clientId={client.id} categories={documentCategories} />
            </div>
            <DocumentsTable documents={documents} showClient={false} />
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <TaskFormDialog workspaceId={client.workspace_id} staff={staffOptions} clientId={client.id} />
            </div>
            <TaskListView tasks={tasks} />
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <ClientActivityTab clientId={client.id} />
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
