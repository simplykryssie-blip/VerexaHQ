import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { TaxIdReveal } from "./TaxIdReveal";
import { DateOfBirthInput } from "./DateOfBirthInput";
import { InviteContactToPortalButton } from "./InviteContactToPortalButton";
import { PaymentLinkButton } from "@/components/PaymentLinkButton";
import { CreatePaymentPlanForm } from "@/components/billing/CreatePaymentPlanForm";
import { PaymentPlanList, type PaymentPlanRow } from "@/components/billing/PaymentPlanList";
import { RecordPaymentForm } from "@/components/billing/RecordPaymentForm";
import {
  AddContactForm,
  AddAddressForm,
  AddRelationshipForm,
  AddPortalUserForm,
  AddNoteForm,
} from "./AddForms";

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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-slate">{value ?? "--"}</dd>
    </div>
  );
}

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------- Overview

export function OverviewTab({
  client,
  engagements,
  tasks,
  timeline,
  invoices,
  notes,
  outstandingBalance,
  requestedDocumentCount,
  documentsCount,
  organizerResponses,
}: {
  client: {
    id: string;
    client_type: string;
    primary_email: string | null;
    primary_phone: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    ssn_last4: string | null;
    ein_last4: string | null;
    itin_last4: string | null;
  };
  engagements: EngagementRow[];
  tasks: TaskRow[];
  timeline: ActivityRow[];
  invoices: InvoiceRow[];
  notes: NoteRow[];
  outstandingBalance: number;
  requestedDocumentCount: number;
  documentsCount: number;
  organizerResponses: OrganizerResponseRow[];
}) {
  const openEngagements = engagements.filter((e) => e.status !== "Completed" && e.status !== "Archived");
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const upcomingDeadlines = [
    ...engagements.filter((e) => e.due_date).map((e) => ({ label: e.engagement_number ?? "Engagement", date: e.due_date as string })),
    ...tasks.filter((t) => t.due_date).map((t) => ({ label: t.title, date: t.due_date as string })),
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);
  const outstandingInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft");
  const missingDocuments = Math.max(requestedDocumentCount - documentsCount, 0);

  return (
    <div className="space-y-6">
      <Section title="Summary">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Primary email" value={client.primary_email} />
          <Field label="Primary phone" value={client.primary_phone} />
          <Field label="Address" value={[client.address_line1, client.city, client.state].filter(Boolean).join(", ") || null} />
        </dl>
        <p className="mt-3 text-xs text-muted">
          SSN/EIN/ITIN and date of birth are on the <span className="font-medium text-slate">Contacts</span> tab.
        </p>
      </Section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Current engagements</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{openEngagements.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Open tasks</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{openTasks.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Outstanding balance</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{money(outstandingBalance)}</p>
        </div>
      </div>

      <Section title="Upcoming deadlines">
        {upcomingDeadlines.length === 0 ? (
          <EmptyState message="No upcoming deadlines." />
        ) : (
          <ul className="divide-y divide-border">
            {upcomingDeadlines.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">{d.label}</span>
                <span className="text-muted">{new Date(d.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Missing documents">
        {missingDocuments === 0 ? (
          <EmptyState message="Nothing outstanding." />
        ) : (
          <p className="py-2 text-sm text-slate">
            ~{missingDocuments} document{missingDocuments === 1 ? "" : "s"} still requested but not yet uploaded.
          </p>
        )}
      </Section>

      <Section title="Organizers">
        {organizerResponses.length === 0 ? (
          <EmptyState message="No organizer sent yet -- use Send Organizer above to assign one." />
        ) : (
          <ul className="divide-y divide-border">
            {organizerResponses.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">{o.template_name}</span>
                <span className="capitalize text-muted">
                  {o.status.replace("_", " ")}
                  {o.submitted_at && ` -- submitted ${new Date(o.submitted_at).toLocaleDateString()}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Outstanding invoices">
        {outstandingInvoices.length === 0 ? (
          <EmptyState message="No outstanding invoices." />
        ) : (
          <ul className="divide-y divide-border">
            {outstandingInvoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">{i.invoice_number ?? "Invoice"}</span>
                <span className="capitalize text-muted">
                  {i.status} -- {money(i.total_amount - i.amount_paid)} due
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent activity">
        {timeline.length === 0 ? (
          <EmptyState message="No activity recorded yet." />
        ) : (
          <ul className="space-y-2">
            {timeline.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-slate">{a.description}</span>
                <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent messages" action={undefined}>
        {notes.length === 0 ? (
          <EmptyState message="No notes yet." />
        ) : (
          <ul className="space-y-2">
            {notes.slice(0, 3).map((n) => (
              <li key={n.id} className="text-sm text-slate">
                {n.body}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Contacts

export function ContactsTab({
  client,
  workspaceId,
  contacts,
  addresses,
  portalUsers,
}: {
  client: {
    id: string;
    client_type: string;
    ssn_last4: string | null;
    ein_last4: string | null;
    itin_last4: string | null;
    date_of_birth: string | null;
  };
  workspaceId: string;
  contacts: ContactRow[];
  addresses: AddressRow[];
  portalUsers: PortalUserRow[];
}) {
  const portalByEmail = new Map(
    portalUsers.filter((p) => p.invited_email).map((p) => [p.invited_email.toLowerCase(), p])
  );
  const matchedPortalIds = new Set(
    contacts
      .map((c) => (c.email ? portalByEmail.get(c.email.toLowerCase())?.id : undefined))
      .filter((id): id is string => Boolean(id))
  );
  const unmatchedPortalUsers = portalUsers.filter((p) => !matchedPortalIds.has(p.id));

  return (
    <div className="space-y-6">
      <Section title="Identity">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {client.client_type === "individual" ? (
            <>
              <TaxIdReveal clientId={client.id} kind="ssn" last4={client.ssn_last4} />
              <TaxIdReveal clientId={client.id} kind="itin" last4={client.itin_last4} />
            </>
          ) : (
            <TaxIdReveal clientId={client.id} kind="ein" last4={client.ein_last4} />
          )}
          <DateOfBirthInput clientId={client.id} currentDate={client.date_of_birth} />
        </dl>
      </Section>

      <Section title="Contacts" action={<AddContactForm clientId={client.id} workspaceId={workspaceId} />}>
        {contacts.length === 0 ? (
          <EmptyState message="No contacts yet." />
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
              const portal = c.email ? portalByEmail.get(c.email.toLowerCase()) : undefined;
              return (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate">
                      {name || "Unnamed contact"}
                      {c.title && <span className="ml-2 text-xs font-normal text-muted">{c.title}</span>}
                      {c.is_primary && <span className="ml-2 text-xs text-accent">Primary</span>}
                    </span>
                    {portal ? (
                      <span className="text-xs capitalize text-muted">Portal: {portal.status}</span>
                    ) : c.email ? (
                      <InviteContactToPortalButton clientId={client.id} workspaceId={workspaceId} name={name} email={c.email} />
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted">
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {unmatchedPortalUsers.length > 0 && (
        <Section title="Other portal invites" action={<AddPortalUserForm clientId={client.id} workspaceId={workspaceId} />}>
          <ul className="divide-y divide-border">
            {unmatchedPortalUsers.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">
                  {p.invited_name ?? p.invited_email}
                  {p.is_primary && <span className="ml-2 text-xs text-accent">Primary</span>}
                </span>
                <span className="capitalize text-muted">{p.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Addresses" action={<AddAddressForm clientId={client.id} workspaceId={workspaceId} />}>
        {addresses.length === 0 ? (
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
    </div>
  );
}

// ----------------------------------------------------------- Relationships

export function RelationshipsTab({
  clientId,
  workspaceId,
  relationships,
}: {
  clientId: string;
  workspaceId: string;
  relationships: RelationshipRow[];
}) {
  return (
    <Section title="Relationships" action={<AddRelationshipForm clientId={clientId} workspaceId={workspaceId} />}>
      {relationships.length === 0 ? (
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
  );
}

// ------------------------------------------------------------- Engagements

export function EngagementsTab({ engagements, client }: { engagements: EngagementRow[]; client: ClientHeaderInfo }) {
  return (
    <Section title="Engagements">
      {engagements.length === 0 ? (
        <EmptyState message="No engagements yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Assigned staff</th>
                <th className="px-4 py-2 font-medium">Reviewer</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Engagement due date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {engagements.map((e) => {
                const staffDiffers = e.assigned_staff?.id && e.assigned_staff.id !== client.relationship_manager?.id;
                const reviewerDiffers = e.reviewer?.id && e.reviewer.id !== client.default_reviewer?.id;
                return (
                  <tr key={e.id} className="hover:bg-surfaceMuted">
                    <td className="px-4 py-2">
                      <Link href={`/engagements/${e.id}`} className="font-medium text-accent hover:underline">
                        {e.engagement_number ?? "Engagement"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate">{e.status}</td>
                    <td className="px-4 py-2 text-slate">
                      {e.assigned_staff?.display_name ?? "Unassigned"}
                      {staffDiffers && <span className="ml-1 text-xs text-warning">(≠ default)</span>}
                    </td>
                    <td className="px-4 py-2 text-slate">
                      {e.reviewer?.display_name ?? "--"}
                      {reviewerDiffers && <span className="ml-1 text-xs text-warning">(≠ default)</span>}
                    </td>
                    <td className="px-4 py-2 text-slate">{e.priority ?? "--"}</td>
                    <td className="px-4 py-2 text-slate">{e.due_date ? new Date(e.due_date).toLocaleDateString() : "--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}


// ----------------------------------------------------------------- Messages

export function MessagesTab({
  threads,
  messages,
  onViewDocumentRequests,
}: {
  threads: MessageThreadRow[];
  messages: MessageRow[];
  onViewDocumentRequests?: () => void;
}) {
  return (
    <Section title="Message threads">
      {threads.length === 0 ? (
        <EmptyState message="No messages yet -- use Send Message or Request Documents to start a thread." />
      ) : (
        <ul className="space-y-4">
          {threads.map((t) => {
            const threadMessages = messages.filter((m) => m.thread_id === t.id);
            const isDocumentRequest = t.subject?.startsWith("Document request:");
            return (
              <li key={t.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{t.subject ?? "Message"}</span>
                  <div className="flex items-center gap-2">
                    {isDocumentRequest && onViewDocumentRequests && (
                      <button type="button" onClick={onViewDocumentRequests} className="text-xs font-medium text-accent hover:underline">
                        View request
                      </button>
                    )}
                    <span className="text-xs uppercase tracking-wide text-muted">{t.channel}</span>
                  </div>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {threadMessages.map((m) => (
                    <li key={m.id} className="text-sm text-slate">
                      <span className={m.is_internal ? "italic text-muted" : ""}>{m.body}</span>
                      <span className="ml-2 text-xs text-muted">{new Date(m.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ Billing

export function BillingTab({
  clientId,
  quotes,
  invoices,
  payments,
  outstandingBalance,
  workspaceId,
  paymentPlansByInvoice,
  canManageBilling,
}: {
  clientId: string;
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  outstandingBalance: number;
  workspaceId: string;
  paymentPlansByInvoice: Record<string, PaymentPlanRow[]>;
  canManageBilling: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted">Outstanding balance</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{money(outstandingBalance)}</p>
      </div>

      <Section title="Quotes">
        {quotes.length === 0 ? (
          <EmptyState message="No quotes yet." />
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">
                  {q.quote_number} -- {q.title}
                </span>
                <span className="capitalize text-muted">
                  {q.status} -- {money(q.total_amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Invoices">
        {invoices.length === 0 ? (
          <EmptyState message="No invoices yet." />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((i) => {
              const plans = paymentPlansByInvoice[i.id] ?? [];
              const isOutstanding = i.status !== "paid" && i.status !== "void" && i.status !== "draft";
              return (
                <li key={i.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate">{i.invoice_number ?? "Invoice"}</span>
                    <div className="flex items-center gap-3">
                      <span className="capitalize text-muted">
                        {i.status} -- {money(i.total_amount)} ({money(i.amount_paid)} paid)
                      </span>
                      {isOutstanding && <PaymentLinkButton invoiceId={i.id} />}
                    </div>
                  </div>
                  {isOutstanding && canManageBilling && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <RecordPaymentForm
                        invoiceId={i.id}
                        workspaceId={workspaceId}
                        clientId={clientId}
                        balanceDue={i.total_amount - i.amount_paid}
                      />
                      {plans.length === 0 && (
                        <CreatePaymentPlanForm invoiceId={i.id} workspaceId={workspaceId} balanceDue={i.total_amount - i.amount_paid} />
                      )}
                    </div>
                  )}
                  <PaymentPlanList plans={plans} />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Payments">
        {payments.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">{new Date(p.payment_date).toLocaleDateString()}</span>
                <span className="capitalize text-muted">
                  {p.status} -- {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- Timeline

export function TimelineTab({ timeline }: { timeline: ActivityRow[] }) {
  return (
    <Section title="Timeline">
      {timeline.length === 0 ? (
        <EmptyState message="No activity recorded yet." />
      ) : (
        <ul className="space-y-3">
          {timeline.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="text-slate">{a.description}</span>
              <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------- Notes

export function NotesTab({ clientId, workspaceId, notes }: { clientId: string; workspaceId: string; notes: NoteRow[] }) {
  const pinned = notes.filter((n) => n.is_pinned);
  const rest = notes.filter((n) => !n.is_pinned);
  return (
    <Section title="Notes" action={<AddNoteForm entityType="client" entityId={clientId} workspaceId={workspaceId} />}>
      {notes.length === 0 ? (
        <EmptyState message="No notes yet." />
      ) : (
        <ul className="space-y-3">
          {[...pinned, ...rest].map((n) => (
            <li key={n.id} className="rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
              {n.is_pinned && <span className="mr-2 text-xs font-medium text-accent">Pinned</span>}
              {n.is_internal && <span className="mr-2 text-xs font-medium text-muted">Internal</span>}
              {n.subject && <p className="font-semibold text-ink">{n.subject}</p>}
              <p>{n.body}</p>
              <p className="mt-1 text-xs text-muted">{new Date(n.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------- Types

export type ContactRow = { id: string; first_name: string | null; last_name: string | null; title: string | null; email: string | null; phone: string | null; is_primary: boolean };
export type AddressRow = { id: string; address_type: string; street: string | null; city: string | null; state: string | null; zip: string | null };
export type PortalUserRow = { id: string; invited_name: string | null; invited_email: string; is_primary: boolean; status: string };
export type RelationshipRow = { id: string; relationship_type: string; related_name: string | null; related_client_id: string | null };
export type NoteRow = { id: string; subject: string | null; body: string; is_pinned: boolean; is_internal: boolean; is_private: boolean; created_at: string };
export type ActivityRow = { id: string; description: string; activity_type: string; created_at: string };
export type TaskRow = { id: string; title: string; status: string; due_date: string | null; engagement_id: string };
export type QuoteRow = { id: string; quote_number: string | null; title: string; status: string; total_amount: number };
export type InvoiceRow = { id: string; invoice_number: string | null; status: string; total_amount: number; amount_paid: number; due_date: string | null };
export type PaymentRow = { id: string; status: string; amount: number; payment_date: string };
export type MessageThreadRow = { id: string; subject: string | null; channel: string };
export type MessageRow = { id: string; thread_id: string; body: string; is_internal: boolean; created_at: string };
type StaffRef = { id: string; display_name: string | null } | null;
export type EngagementRow = {
  id: string;
  engagement_number: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_staff: StaffRef;
  reviewer: StaffRef;
  compliance_officer: StaffRef;
};
export type ClientHeaderInfo = { relationship_manager: StaffRef; default_reviewer: StaffRef; default_compliance_officer: StaffRef };
export type OrganizerResponseRow = { id: string; status: string; submitted_at: string | null; template_name: string };
