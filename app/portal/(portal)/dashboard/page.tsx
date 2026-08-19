import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, AlertTriangle, PenLine, Receipt, Phone, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();

  const { data: myEngagements } = await supabase.from("engagements").select("id").eq("client_id", identity.clientId);
  const engagementIds = (myEngagements ?? []).map((e) => e.id);
  const entityFilter =
    engagementIds.length > 0
      ? `and(entity_type.eq.client,entity_id.eq.${identity.clientId}),and(entity_type.eq.engagement,entity_id.in.(${engagementIds.join(",")}))`
      : `and(entity_type.eq.client,entity_id.eq.${identity.clientId})`;
  const { data: myAttachments } = await supabase.from("attachments").select("id").or(entityFilter);
  const attachmentIds = (myAttachments ?? []).map((a) => a.id);

  const [{ data: engagements }, { data: openRequests }, { data: pendingSignatures }, { data: invoices }, { data: activity }, { data: contactRows }] =
    await Promise.all([
      supabase
        .from("engagements")
        .select("id, engagement_number, status, due_date, services(name)")
        .eq("client_id", identity.clientId)
        .order("open_date", { ascending: false }),
      supabase
        .from("document_requests")
        .select("id, title, due_date, items:document_request_item_statuses(id, is_required, status)")
        .eq("status", "open")
        .or(entityFilter),
      attachmentIds.length > 0
        ? supabase
            .from("signature_requests")
            .select("id, title, due_date, attachment:attachments!signature_requests_attachment_id_fkey(file_name)")
            .eq("status", "pending")
            .in("attachment_id", attachmentIds)
        : Promise.resolve({ data: [] as { id: string; title: string; due_date: string | null; attachment: { file_name: string } | null }[] }),
      supabase.from("invoices").select("id, invoice_number, total_amount, amount_paid, status, due_date").eq("client_id", identity.clientId),
      supabase
        .from("activity_log")
        .select("id, description, created_at")
        .or(entityFilter)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.rpc("get_portal_client_contact"),
    ]);

  const contact = contactRows?.[0] ?? null;

  const missingDocuments = (openRequests ?? []).reduce(
    (sum, r) => sum + (r.items ?? []).filter((i) => i.is_required && i.status === "pending").length,
    0
  );
  const outstandingBalance = (invoices ?? []).reduce((sum, inv) => sum + Math.max(inv.total_amount - inv.amount_paid, 0), 0);
  const activeEngagements = (engagements ?? []).filter((e) => e.status !== "Completed" && e.status !== "Archived");

  return (
    <>
      <PageHeader title={`Welcome, ${identity.clientLabel}`} description="Here's what's happening with your account." />
      <div className="flex-1 space-y-6 px-8 py-6">
        {contact && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border bg-surface shadow-soft px-4 py-3 text-sm">
            <span className="font-medium text-slate">Your contact: {contact.name}</span>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 text-muted hover:text-accent">
                <Phone size={13} aria-hidden="true" />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-muted hover:text-accent">
                <Mail size={13} aria-hidden="true" />
                {contact.email}
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={FileText} label="Active engagements" value={activeEngagements.length} href="/portal/engagements" />
          <StatCard icon={AlertTriangle} label="Missing documents" value={missingDocuments} href="/portal/documents" />
          <StatCard icon={PenLine} label="Pending signatures" value={(pendingSignatures ?? []).length} href="/portal/documents" />
          <StatCard icon={Receipt} label="Balance due" value={`$${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} href="/portal/billing" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-surface shadow-soft">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">Your engagements</h2>
            {activeEngagements.length === 0 ? (
              <EmptyState message="No active engagements right now." />
            ) : (
              <ul className="divide-y divide-border">
                {activeEngagements.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate">{(e.services as unknown as { name?: string } | null)?.name ?? "Engagement"}</p>
                      <p className="text-xs text-muted">{e.engagement_number}</p>
                    </div>
                    <span className="text-xs capitalize text-muted">{e.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface shadow-soft">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">Recent activity</h2>
            {(activity ?? []).length === 0 ? (
              <EmptyState message="No activity yet." />
            ) : (
              <ul className="divide-y divide-border">
                {(activity ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate">{a.description}</span>
                    <span className="text-xs text-muted">{new Date(a.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="text-xs text-muted">
          Need something requested faster? <Link href="/portal/messages" className="text-accent hover:underline">Send us a message</Link>.
        </p>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-border bg-surface shadow-soft p-4 transition hover:border-accent">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={16} aria-hidden="true" />
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </Link>
  );
}
