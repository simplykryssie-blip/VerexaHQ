import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { TaxIdReveal } from "./TaxIdReveal";
import { DateOfBirthInput } from "./DateOfBirthInput";
import { InviteContactToPortalButton } from "./InviteContactToPortalButton";
import { PaymentLinkButton } from "@/components/PaymentLinkButton";
import { CreatePaymentPlanForm } from "@/components/billing/CreatePaymentPlanForm";
import { PaymentPlanList, type PaymentPlanRow } from "@/components/billing/PaymentPlanList";
import { RecordPaymentForm } from "@/components/billing/RecordPaymentForm";
import { PreviewButton } from "@/components/billing/PreviewButton";
import { AddRelationshipForm, RelationshipsList } from "./RelationshipsSection";
import { ClientAssignmentForm } from "./ClientAssignmentForm";
import { AddAppointmentForm } from "./AddAppointmentForm";
import {
  AddContactForm,
  EditContactForm,
  DeleteContactButton,
  AddAddressForm,
  EditAddressForm,
  DeleteAddressButton,
  AddPortalUserForm,
  AddNoteForm,
} from "./AddForms";
import { EditClientProfileForm } from "./EditClientProfileForm";

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

function clientDisplayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export function OverviewTab({
  client,
  workspaceId,
  showStaffRoles = true,
  contacts,
  addresses,
  portalUsers,
  relationships,
  staffOptions,
  accountHolder,
  engagements,
  tasks,
  appointments,
  invoices,
  notes,
  outstandingBalance,
  organizerResponses,
  onCreateInvoice,
  onShowNotes,
  onCreateNote,
}: {
  client: {
    id: string;
    client_type: string;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    primary_email: string | null;
    primary_phone: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    ssn_last4: string | null;
    ein_last4: string | null;
    itin_last4: string | null;
    date_of_birth: string | null;
    relationship_manager: ClientHeaderInfo["relationship_manager"];
    default_reviewer: ClientHeaderInfo["default_reviewer"];
    default_compliance_officer: ClientHeaderInfo["default_compliance_officer"];
  };
  workspaceId: string;
  showStaffRoles?: boolean;
  contacts: ContactRow[];
  addresses: AddressRow[];
  portalUsers: PortalUserRow[];
  relationships: RelationshipRow[];
  staffOptions: StaffOption[];
  accountHolder: { id: string; display_name: string | null } | null;
  engagements: EngagementRow[];
  tasks: TaskRow[];
  appointments: AppointmentRow[];
  invoices: InvoiceRow[];
  notes: NoteRow[];
  outstandingBalance: number;
  organizerResponses: OrganizerResponseRow[];
  onCreateInvoice: () => void;
  onShowNotes: () => void;
  onCreateNote: () => void;
}) {
  const portalByEmail = new Map(portalUsers.filter((p) => p.invited_email).map((p) => [p.invited_email.toLowerCase(), p]));
  const matchedPortalIds = new Set(
    contacts.map((c) => (c.email ? portalByEmail.get(c.email.toLowerCase())?.id : undefined)).filter((id): id is string => Boolean(id))
  );
  const unmatchedPortalUsers = portalUsers.filter((p) => !matchedPortalIds.has(p.id));

  const openEngagements = engagements.filter((e) => e.status !== "Completed" && e.status !== "Archived");
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const upcomingItems = [
    ...appointments.map((a) => ({ label: a.title, date: a.start_at, kind: "Appointment" })),
    ...tasks.filter((t) => t.due_date).map((t) => ({ label: t.title, date: t.due_date as string, kind: "Task" })),
    ...engagements.filter((e) => e.due_date).map((e) => ({ label: e.engagement_number ?? "Engagement", date: e.due_date as string, kind: "Deadline" })),
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 6);
  const outstandingInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft");
  const recentNotes = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  return (
    <div className="space-y-6">
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

      <Section title="Identifying info" action={<EditClientProfileForm client={client} />}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Name" value={clientDisplayName(client)} />
          <Field label="Primary email" value={client.primary_email} />
          <Field label="Primary phone" value={client.primary_phone} />
          {client.client_type === "individual" ? (
            <>
              <TaxIdReveal clientId={client.id} kind="ssn" last4={client.ssn_last4} />
              <TaxIdReveal clientId={client.id} kind="itin" last4={client.itin_last4} />
              <DateOfBirthInput clientId={client.id} currentDate={client.date_of_birth} />
            </>
          ) : (
            <TaxIdReveal clientId={client.id} kind="ein" last4={client.ein_last4} />
          )}
        </dl>

        {showStaffRoles && (
          <div className="mt-4 border-t border-border pt-4">
            <ClientAssignmentForm
              clientId={client.id}
              relationshipManager={client.relationship_manager}
              defaultReviewer={client.default_reviewer}
              defaultComplianceOfficer={client.default_compliance_officer}
              accountHolder={accountHolder}
              staffOptions={staffOptions}
            />
          </div>
        )}

        {client.client_type === "business" && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Contacts</h3>
            <AddContactForm clientId={client.id} workspaceId={workspaceId} />
          </div>
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
                      <div className="flex items-center gap-2">
                        {portal ? (
                          <span className="text-xs capitalize text-muted">Portal: {portal.status}</span>
                        ) : c.email ? (
                          <InviteContactToPortalButton clientId={client.id} workspaceId={workspaceId} name={name} email={c.email} />
                        ) : null}
                        <EditContactForm contact={c} />
                        <DeleteContactButton contactId={c.id} />
                      </div>
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
          {unmatchedPortalUsers.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Other portal invites</h4>
                <AddPortalUserForm clientId={client.id} workspaceId={workspaceId} />
              </div>
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
            </div>
          )}
        </div>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Addresses</h3>
            <AddAddressForm clientId={client.id} workspaceId={workspaceId} />
          </div>
          {addresses.length === 0 ? (
            <EmptyState message="No additional addresses." />
          ) : (
            <ul className="divide-y divide-border">
              {addresses.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm text-slate">
                  <span>
                    <span className="mr-2 capitalize text-muted">{a.address_type}:</span>
                    {[a.street, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <EditAddressForm address={a} />
                    <DeleteAddressButton addressId={a.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {client.client_type === "individual" && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Relationships</h3>
            <AddRelationshipForm clientId={client.id} workspaceId={workspaceId} />
          </div>
          <RelationshipsList relationships={relationships} />
        </div>
        )}
      </Section>

      <Section
        title="Engagements"
        action={
          <Link href={`/engagements/new?clientId=${client.id}`} className="text-xs font-medium text-accent hover:underline">
            + Add Engagement
          </Link>
        }
      >
        {engagements.length === 0 ? (
          <EmptyState message="No engagements yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Number</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Assigned staff</th>
                  <th className="px-4 py-2 font-medium">Reviewer</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium">Tax year</th>
                  <th className="px-4 py-2 font-medium">Next due date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {engagements.map((e) => {
                  const staffDiffers = e.assigned_staff?.id && e.assigned_staff.id !== client.relationship_manager?.id;
                  const reviewerDiffers = e.reviewer?.id && e.reviewer.id !== client.default_reviewer?.id;
                  const taxYear = engagementTaxYear(e);
                  return (
                    <tr key={e.id} className="hover:bg-surfaceMuted">
                      <td className="px-4 py-2">
                        <Link href={`/engagements/${e.id}`} className="font-medium text-accent hover:underline">
                          {e.engagement_number ?? "Engagement"}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate">{e.engagement_types?.name ?? "--"}</td>
                      <td className="px-4 py-2 text-slate">{e.status}</td>
                      <td className="px-4 py-2 text-slate">
                        {e.assigned_staff?.display_name ?? "Unassigned"}
                        {staffDiffers && (
                          <span className="ml-1 text-xs text-warning" title="Differs from this client's default relationship manager">
                            (differs from default)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate">
                        {e.reviewer?.display_name ?? "--"}
                        {reviewerDiffers && (
                          <span className="ml-1 text-xs text-warning" title="Differs from this client's default reviewer">
                            (differs from default)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate">{e.priority ?? "--"}</td>
                      <td className="px-4 py-2 text-slate">{taxYear ?? "--"}</td>
                      <td className="px-4 py-2 text-slate">{e.due_date ? new Date(e.due_date).toLocaleDateString() : "--"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {organizerResponses.length > 0 && (
        <Section title="Organizers">
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
        </Section>
      )}

      <Section title="Upcoming" action={<AddAppointmentForm clientId={client.id} workspaceId={workspaceId} />}>
        {upcomingItems.length === 0 ? (
          <EmptyState message="Nothing upcoming." />
        ) : (
          <ul className="divide-y divide-border">
            {upcomingItems.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">
                  <span className="mr-2 text-xs uppercase tracking-wide text-muted">{d.kind}</span>
                  {d.label}
                </span>
                <span className="text-muted">{new Date(d.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Billing" action={<button type="button" onClick={onCreateInvoice} className="text-xs font-medium text-accent hover:underline">+ Create Invoice</button>}>
        <p className="text-sm text-slate">Outstanding balance: <span className="font-semibold text-ink">{money(outstandingBalance)}</span></p>
        {outstandingInvoices.length > 0 && (
          <ul className="mt-2 divide-y divide-border">
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

      <Section
        title="Notes"
        action={
          <div className="flex items-center gap-3">
            <button type="button" onClick={onShowNotes} className="text-xs font-medium text-accent hover:underline">Show more</button>
            <button type="button" onClick={onCreateNote} className="text-xs font-medium text-accent hover:underline">+ Create a note</button>
          </div>
        }
      >
        {recentNotes.length === 0 ? (
          <EmptyState message="No notes yet." />
        ) : (
          <ul className="space-y-2">
            {recentNotes.map((n) => (
              <li key={n.id} className="text-sm text-slate">
                {n.subject && <span className="font-semibold text-ink">{n.subject}: </span>}
                {n.body}
                <span className="ml-2 text-xs text-muted">{new Date(n.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------- Engagements

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
  clientName,
  workspaceName,
  quotes,
  invoices,
  payments,
  outstandingBalance,
  workspaceId,
  paymentPlansByInvoice,
  canManageBilling,
}: {
  clientId: string;
  clientName: string;
  workspaceName: string;
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
                <div className="flex items-center gap-3">
                  <span className="capitalize text-muted">
                    {q.status} -- {money(q.total_amount)}
                  </span>
                  <PreviewButton
                    kind="quote"
                    firmName={workspaceName}
                    clientName={clientName}
                    number={q.quote_number}
                    issueDate={q.created_at}
                    dueDate={q.valid_until}
                    lineItems={q.line_items ?? []}
                    subtotal={q.subtotal}
                    discountAmount={q.discount_amount}
                    taxAmount={q.tax_amount}
                    totalAmount={q.total_amount}
                    notes={q.notes}
                    status={q.status}
                  />
                </div>
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
                      <PreviewButton
                        kind="invoice"
                        firmName={workspaceName}
                        clientName={clientName}
                        number={i.invoice_number}
                        issueDate={i.issue_date}
                        dueDate={i.due_date}
                        lineItems={i.line_items ?? []}
                        subtotal={i.subtotal}
                        discountAmount={i.discount_amount}
                        taxAmount={i.tax_amount}
                        totalAmount={i.total_amount}
                        notes={i.notes}
                        status={i.status}
                      />
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
export type RelationshipRow = {
  id: string;
  relationship_type: string;
  related_name: string | null;
  related_client_id: string | null;
  related_dob: string | null;
  related_ssn_last4: string | null;
};
export type NoteRow = { id: string; subject: string | null; body: string; is_pinned: boolean; is_internal: boolean; is_private: boolean; created_at: string };
export type ActivityRow = { id: string; description: string; activity_type: string; created_at: string };
export type TaskRow = { id: string; title: string; status: string; due_date: string | null; engagement_id: string };
export type QuoteRow = {
  id: string;
  quote_number: string | null;
  title: string;
  status: string;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  line_items: { description: string; quantity: number; unit_price: number }[];
  created_at: string;
  valid_until: string | null;
  notes: string | null;
};
export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  due_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  line_items: { description: string; quantity: number; unit_price: number }[];
  issue_date: string | null;
  notes: string | null;
};
export type PaymentRow = { id: string; status: string; amount: number; payment_date: string };
export type MessageThreadRow = { id: string; subject: string | null; channel: string };
export type MessageRow = { id: string; thread_id: string; body: string; is_internal: boolean; created_at: string };
type StaffRef = { id: string; display_name: string | null } | null;
export type StaffOption = { id: string; display_name: string | null };
export type EngagementRow = {
  id: string;
  engagement_number: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_staff: StaffRef;
  reviewer: StaffRef;
  compliance_officer: StaffRef;
  engagement_types: { name: string } | null;
  engagement_tax_details: { tax_year: number | null }[] | { tax_year: number | null } | null;
};

function engagementTaxYear(e: EngagementRow): number | null {
  const detail = Array.isArray(e.engagement_tax_details) ? e.engagement_tax_details[0] : e.engagement_tax_details;
  return detail?.tax_year ?? null;
}
export type ClientHeaderInfo = { relationship_manager: StaffRef; default_reviewer: StaffRef; default_compliance_officer: StaffRef };
export type OrganizerResponseRow = { id: string; status: string; submitted_at: string | null; template_name: string };
export type AppointmentRow = { id: string; title: string; start_at: string; location: string | null };
