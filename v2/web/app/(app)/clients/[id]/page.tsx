import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  AddContactForm,
  AddAddressForm,
  AddPhoneForm,
  AddEmailForm,
  AddRelationshipForm,
  AddPortalUserForm,
  AddNoteForm,
} from "./AddForms";

function displayName(c: {
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
}) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", params.id).single();
  if (!client) notFound();

  const [
    { data: contacts },
    { data: addresses },
    { data: phones },
    { data: emails },
    { data: relationships },
    { data: portalUsers },
    { data: engagements },
    { data: notes },
    { data: documents },
  ] = await Promise.all([
    supabase.from("client_contacts").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_addresses").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_phones").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_emails").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_relationships").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_portal_users").select("*").eq("client_id", client.id).order("display_order"),
    supabase
      .from("engagements")
      .select("id, engagement_number, status, engagement_type_id, open_date, due_date")
      .eq("client_id", client.id)
      .order("open_date", { ascending: false }),
    supabase
      .from("notes")
      .select("id, body, is_pinned, created_at")
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("id, file_name, created_at")
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        title={displayName(client)}
        description={`${client.client_type === "business" ? "Business" : "Individual"} client -- ${client.lifecycle_status}`}
      />

      <div className="flex-1 space-y-6 px-8 py-6">
        {/* Overview */}
        <Section title="Overview">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Primary email" value={client.primary_email} />
            <Field label="Primary phone" value={client.primary_phone} />
            <Field
              label="Address"
              value={[client.address_line1, client.city, client.state].filter(Boolean).join(", ") || null}
            />
          </dl>
        </Section>

        {/* Contacts -- Progressive Disclosure: only render existing rows */}
        <Section title="Contacts" action={<AddContactForm clientId={client.id} workspaceId={workspace.id} />}>
          {!contacts || contacts.length === 0 ? (
            <EmptyState message="No additional contacts." />
          ) : (
            <ul className="divide-y divide-border">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                    {c.is_primary && <span className="ml-2 text-xs text-accent">Primary</span>}
                  </span>
                  <span className="text-muted">{c.email ?? c.phone ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Addresses" action={<AddAddressForm clientId={client.id} workspaceId={workspace.id} />}>
          {!addresses || addresses.length === 0 ? (
            <EmptyState message="No additional addresses." />
          ) : (
            <ul className="divide-y divide-border">
              {addresses.map((a) => (
                <li key={a.id} className="py-2 text-sm text-slate">
                  <span className="mr-2 capitalize text-muted">{a.address_type}:</span>
                  {[a.street, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Phone Numbers" action={<AddPhoneForm clientId={client.id} workspaceId={workspace.id} />}>
          {!phones || phones.length === 0 ? (
            <EmptyState message="No additional phone numbers." />
          ) : (
            <ul className="divide-y divide-border">
              {phones.map((p) => (
                <li key={p.id} className="py-2 text-sm text-slate">
                  <span className="mr-2 capitalize text-muted">{p.phone_type}:</span>
                  {p.phone_number}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Email Addresses" action={<AddEmailForm clientId={client.id} workspaceId={workspace.id} />}>
          {!emails || emails.length === 0 ? (
            <EmptyState message="No additional email addresses." />
          ) : (
            <ul className="divide-y divide-border">
              {emails.map((e) => (
                <li key={e.id} className="py-2 text-sm text-slate">
                  <span className="mr-2 capitalize text-muted">{e.email_type}:</span>
                  {e.email}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Relationships"
          action={<AddRelationshipForm clientId={client.id} workspaceId={workspace.id} />}
        >
          {!relationships || relationships.length === 0 ? (
            <EmptyState message="No relationships recorded." />
          ) : (
            <ul className="divide-y divide-border">
              {relationships.map((r) => (
                <li key={r.id} className="py-2 text-sm text-slate">
                  <span className="mr-2 capitalize text-muted">{r.relationship_type}:</span>
                  {r.related_name ?? r.related_client_id}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Portal Users" action={<AddPortalUserForm clientId={client.id} workspaceId={workspace.id} />}>
          {!portalUsers || portalUsers.length === 0 ? (
            <EmptyState message="No portal users invited yet." />
          ) : (
            <ul className="divide-y divide-border">
              {portalUsers.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate">
                    {p.invited_name ?? p.invited_email}
                    {p.is_primary && <span className="ml-2 text-xs text-accent">Primary</span>}
                  </span>
                  <span className="capitalize text-muted">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Engagements: existing only, + New Engagement */}
        <Section
          title="Engagements"
          action={
            <Link
              href={`/engagements/new?clientId=${client.id}`}
              className="text-sm font-medium text-accent hover:underline"
            >
              + New Engagement
            </Link>
          }
        >
          {!engagements || engagements.length === 0 ? (
            <EmptyState message="No engagements yet." />
          ) : (
            <ul className="divide-y divide-border">
              {engagements.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/engagements/${e.id}`} className="font-medium text-accent hover:underline">
                    {e.engagement_number}
                  </Link>
                  <span className="text-muted">{e.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Documents">
          {!documents || documents.length === 0 ? (
            <EmptyState message="No documents uploaded yet." />
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((d) => (
                <li key={d.id} className="py-2 text-sm text-slate">
                  {d.file_name}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Notes" action={<AddNoteForm entityType="client" entityId={client.id} workspaceId={workspace.id} />}>
          {!notes || notes.length === 0 ? (
            <EmptyState message="No notes yet." />
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
                  <p>{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{new Date(n.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-slate">{value ?? "--"}</dd>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}
