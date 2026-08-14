import { Eye } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ORGANIZER_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  reviewed: "Reviewed",
};

type Engagement = { id: string; engagement_number: string | null; status: string; due_date: string | null; services: { name: string } | null };
type Folder = { id: string; name: string; parent_folder_id: string | null };
type Attachment = { id: string; file_name: string; folder_id: string | null; created_at: string };
type DocumentRequest = { id: string; title: string; due_date: string | null; status: string; items: { id: string; is_required: boolean; status: string }[] };
type SignatureRequest = { id: string; title: string; status: string; due_date: string | null };
type Thread = { id: string; subject: string | null; entity_type: string; entity_id: string; last_message_at: string | null };
type Message = { id: string; thread_id: string; sender_type: string; body: string; created_at: string };
type Invoice = { id: string; invoice_number: string | null; total_amount: number; amount_paid: number; status: string; issue_date: string; due_date: string | null };
type Payment = { id: string; amount: number; payment_date: string; status: string };
type PaymentPlan = { id: string; invoice_id: string; installment_number: number; amount: number; due_date: string; status: string };
type OrganizerResponse = { id: string; status: string; submitted_at: string | null; organizer_templates: { name: string } | null };
type Appointment = { id: string; title: string; start_at: string; end_at: string; status: string; location: string | null };

export function ClientPortalPreview({
  clientName,
  engagements,
  folders,
  attachments,
  documentRequests,
  signatureRequests,
  threads,
  messages,
  invoices,
  payments,
  paymentPlans,
  organizerResponses,
  appointments,
}: {
  clientName: string;
  engagements: Engagement[];
  folders: Folder[];
  attachments: Attachment[];
  documentRequests: DocumentRequest[];
  signatureRequests: SignatureRequest[];
  threads: Thread[];
  messages: Message[];
  invoices: Invoice[];
  payments: Payment[];
  paymentPlans: PaymentPlan[];
  organizerResponses: OrganizerResponse[];
  appointments: Appointment[];
}) {
  const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.total_amount - inv.amount_paid), 0);
  const missingDocuments = documentRequests.filter((r) => r.status === "open").length;
  const pendingSignatures = signatureRequests.filter((r) => r.status === "pending").length;
  const messagesByThread = new Map<string, Message[]>();
  for (const m of messages) {
    messagesByThread.set(m.thread_id, [...(messagesByThread.get(m.thread_id) ?? []), m]);
  }
  const plansByInvoice = new Map<string, PaymentPlan[]>();
  for (const p of paymentPlans) {
    plansByInvoice.set(p.invoice_id, [...(plansByInvoice.get(p.invoice_id) ?? []), p]);
  }

  return (
    <>
      <PageHeader title="Client Portal Preview" description={`What ${clientName} sees when they log in -- read-only.`} />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accentSoft px-4 py-3 text-sm text-accent">
          <Eye size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>This is a read-only preview. Nothing you view here can be edited, sent, or paid -- to take action, use the client&apos;s regular workspace tabs.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Open engagements</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{engagements.filter((e) => e.status !== "Completed" && e.status !== "Archived").length}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Missing documents</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{missingDocuments}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Balance due</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{money(outstandingBalance)}</p>
          </div>
        </div>

        <Section title="Engagements">
          {engagements.length === 0 ? (
            <EmptyState message="No engagements yet." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {engagements.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate">{e.services?.name ?? "Engagement"}</p>
                    <p className="text-xs text-muted">{e.engagement_number}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    {e.due_date && <span>Due {new Date(e.due_date).toLocaleDateString()}</span>}
                    <Badge tone="neutral" className="capitalize">
                      {e.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Documents">
          {attachments.length === 0 && documentRequests.length === 0 && signatureRequests.length === 0 ? (
            <EmptyState message="No documents yet." />
          ) : (
            <div className="space-y-3">
              {attachments.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {attachments.map((a) => {
                    const folder = folders.find((f) => f.id === a.folder_id);
                    return (
                      <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-slate">{a.file_name}</span>
                        <span className="text-xs text-muted">{folder?.name ?? "General"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {documentRequests.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate">{r.title}</span>
                    <span className="text-xs capitalize text-muted">{r.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {r.items.filter((i) => i.status === "received").length} of {r.items.length} received
                  </p>
                </div>
              ))}
              {signatureRequests.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm">
                  <span className="font-medium text-slate">{s.title}</span>
                  <span className="text-xs capitalize text-muted">{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Messages">
          {threads.length === 0 ? (
            <EmptyState message="No conversations yet." />
          ) : (
            <ul className="space-y-2">
              {threads.map((t) => {
                const threadMessages = messagesByThread.get(t.id) ?? [];
                const last = threadMessages[threadMessages.length - 1];
                return (
                  <li key={t.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                    <p className="font-medium text-slate">{t.subject ?? "Conversation"}</p>
                    {last && (
                      <p className="mt-1 truncate text-xs text-muted">
                        {last.sender_type === "client" ? clientName : "Firm"}: {last.body}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Billing">
          {invoices.length === 0 ? (
            <EmptyState message="No invoices yet." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {invoices.map((inv) => {
                const plans = plansByInvoice.get(inv.id) ?? [];
                return (
                  <li key={inv.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate">{inv.invoice_number ?? "Invoice"}</p>
                        <p className="text-xs text-muted">Issued {new Date(inv.issue_date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs capitalize text-muted">{inv.status}</span>
                        <span className="font-medium text-ink">{money(inv.total_amount)}</span>
                      </div>
                    </div>
                    {plans.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-border pt-2">
                        {plans
                          .sort((a, b) => a.installment_number - b.installment_number)
                          .map((p) => (
                            <li key={p.id} className="flex items-center justify-between text-xs text-muted">
                              <span>
                                Installment {p.installment_number} -- {money(p.amount)} due {new Date(p.due_date).toLocaleDateString()}
                              </span>
                              <span className="capitalize">{p.status}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {payments.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-slate">{new Date(p.payment_date).toLocaleDateString()}</span>
                  <span className="text-xs capitalize text-muted">{p.status}</span>
                  <span className="font-medium text-ink">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Tax organizer">
          {organizerResponses.length === 0 ? (
            <EmptyState message="No organizers started yet." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {organizerResponses.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-medium text-slate">{r.organizer_templates?.name ?? "Organizer"}</span>
                  <span className="text-xs capitalize text-muted">{ORGANIZER_STATUS_LABEL[r.status] ?? r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Appointments">
          {appointments.length === 0 ? (
            <EmptyState message="No appointments scheduled." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {appointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-slate">{a.title}</p>
                    <p className="text-xs text-muted">{new Date(a.start_at).toLocaleString()}</p>
                  </div>
                  <span className="text-xs capitalize text-muted">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
