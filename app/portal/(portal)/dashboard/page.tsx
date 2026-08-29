import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, AlertTriangle, PenLine, Receipt, Phone, Mail, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { getEffectiveBranding } from "@/lib/branding";
import { EmptyState } from "@/components/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import type { IconChipTone } from "@/components/ui/IconChip";
import { ENGAGEMENT_PIPELINE_STATUSES } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

// Plain-language status copy for the progress card, keyed off the real
// engagements.status value -- not a fabricated stat, just a translation of
// the same status the pipeline strip already tracks.
const STATUS_GUIDANCE: Record<string, string> = {
  New: "We're just getting started -- we'll reach out if we need anything from you.",
  "Waiting On Client": "We're waiting on you for the next step.",
  "Waiting On Staff": "It's with our team right now -- no action needed from you.",
  "In Progress": "Our team is actively working on it.",
  "Waiting On Review": "It's in review with our team.",
  "Corrections Requested": "We're making a correction before moving forward.",
  Approved: "Approved and moving to the next step.",
  "Waiting On Signature": "It's ready -- check Documents for a signature request.",
  "Waiting On Payment": "Just waiting on payment to move forward.",
  "Ready To Release": "Almost there -- final steps are underway.",
  Completed: "All done.",
};

export default async function PortalDashboardPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const branding = await getEffectiveBranding(identity.workspaceId);
  // The brand gradient (blue-to-lime) is only for a firm that hasn't set its
  // own accent -- one that has gets a flat tint of that color instead, same
  // rule the staff sidebar and dashboard hero already follow.
  const isDefaultBrand = !branding.secondaryColor;

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
        .select("id, title, due_date, entity_type, entity_id, items:document_request_item_statuses(id, is_required, status)")
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
  const today = new Date();
  const overdueInvoiceCount = (invoices ?? []).filter(
    (inv) => inv.due_date && new Date(inv.due_date) < today && inv.total_amount - inv.amount_paid > 0
  ).length;
  const activeEngagements = (engagements ?? []).filter((e) => e.status !== "Completed" && e.status !== "Archived");

  // The active engagement closest to needing attention -- the one with the
  // nearest due date, or the most recently opened one if none have a due
  // date yet -- is what the hero and progress card speak to directly.
  const primaryEngagement =
    [...activeEngagements].sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    })[0] ?? null;
  const primaryServiceName = (primaryEngagement?.services as unknown as { name?: string } | null)?.name ?? "engagement";
  const primaryStatusIndex = primaryEngagement
    ? ENGAGEMENT_PIPELINE_STATUSES.indexOf(primaryEngagement.status as (typeof ENGAGEMENT_PIPELINE_STATUSES)[number])
    : -1;
  const primaryProgressPercent =
    primaryStatusIndex >= 0 ? Math.round((primaryStatusIndex / (ENGAGEMENT_PIPELINE_STATUSES.length - 1)) * 100) : null;
  const primaryMissingItems = primaryEngagement
    ? (openRequests ?? [])
        .filter((r) => r.entity_type === "engagement" && r.entity_id === primaryEngagement.id)
        .reduce((sum, r) => sum + (r.items ?? []).filter((i) => i.is_required && i.status === "pending").length, 0)
    : 0;
  const progressNote =
    primaryMissingItems > 0
      ? `${primaryMissingItems} document${primaryMissingItems === 1 ? "" : "s"} still needed before this can move forward.`
      : primaryEngagement
        ? (STATUS_GUIDANCE[primaryEngagement.status] ?? "")
        : "";

  const attentionCount = missingDocuments + (pendingSignatures ?? []).length + overdueInvoiceCount;
  const heroSub = primaryEngagement
    ? `Your ${primaryServiceName} is ${primaryEngagement.status.toLowerCase()}.${
        attentionCount > 0
          ? ` ${attentionCount} thing${attentionCount === 1 ? "" : "s"} need${attentionCount === 1 ? "s" : ""} your attention.`
          : " You're all caught up."
      }`
    : attentionCount > 0
      ? `${attentionCount} thing${attentionCount === 1 ? "" : "s"} need${attentionCount === 1 ? "s" : ""} your attention.`
      : "You're all caught up -- nothing needs your attention right now.";

  return (
    <>
      <div className="relative overflow-hidden bg-ink px-8 py-9 text-white">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full opacity-30 blur-3xl ${
            isDefaultBrand ? "bg-gradient-to-br from-accent to-brandLime" : "bg-accent"
          }`}
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{branding.displayName ?? "Your firm"}</p>
          <h1 className="mt-3 max-w-[24ch] font-display text-[26px] font-semibold leading-tight">Welcome back, {identity.clientLabel}.</h1>
          <p className="mt-2 max-w-[48ch] text-sm text-white/70">{heroSub}</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 px-8 py-6">
        {contact && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border bg-surface shadow-soft px-4 py-3 text-sm">
            <span className="font-medium text-slate">Your preparer: {contact.name}</span>
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

        {primaryEngagement && primaryProgressPercent !== null && (
          <div className="flex items-center gap-5 rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <div
              className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full"
              style={{
                background: isDefaultBrand
                  ? `conic-gradient(rgb(var(--brand-accent-rgb, 11 127 224)) 0deg, #A4D22B ${primaryProgressPercent * 3.6}deg, #E3E7F0 ${primaryProgressPercent * 3.6}deg)`
                  : `conic-gradient(rgb(var(--brand-accent-rgb, 11 127 224)) ${primaryProgressPercent * 3.6}deg, #E3E7F0 ${primaryProgressPercent * 3.6}deg)`,
              }}
            >
              <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-surface font-display text-sm font-semibold text-ink">
                {primaryProgressPercent}%
              </div>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">
                {primaryServiceName} &mdash; {primaryEngagement.status}
              </h3>
              {progressNote && <p className="mt-1 text-sm text-slate">{progressNote}</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={FileText} tone="emerald" label="Active engagements" value={activeEngagements.length} href="/portal/engagements" />
          <StatCard icon={AlertTriangle} tone="amber" label="Missing documents" value={missingDocuments} href="/portal/documents" />
          <StatCard icon={PenLine} tone="violet" label="Pending signatures" value={(pendingSignatures ?? []).length} href="/portal/documents" />
          <StatCard
            icon={Receipt}
            tone="rose"
            label="Balance due"
            value={`$${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            href="/portal/billing"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ActionCard
            icon={FileText}
            isDefaultBrand={isDefaultBrand}
            title={missingDocuments > 0 ? `${missingDocuments} document${missingDocuments === 1 ? "" : "s"} needed` : "Documents are all in"}
            description={
              missingDocuments > 0 ? "Upload what's outstanding so we can keep things moving." : "Nothing outstanding on your end right now."
            }
            ctaLabel="View documents"
            href="/portal/documents"
          />
          <ActionCard
            icon={MessageCircle}
            isDefaultBrand={isDefaultBrand}
            title={contact ? `Message ${contact.name.split(" ")[0]}` : "Message your preparer"}
            description="Questions about your return? Send a message and we'll get back to you."
            ctaLabel="Send a message"
            href="/portal/messages"
          />
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

function StatCard({
  icon,
  tone,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  tone: IconChipTone;
  label: string;
  value: React.ReactNode;
  href: string;
}) {
  return (
    <Link href={href}>
      <StatTile icon={icon} tone={tone} label={label} value={value} />
    </Link>
  );
}

function ActionCard({
  icon: Icon,
  isDefaultBrand,
  title,
  description,
  ctaLabel,
  href,
}: {
  icon: React.ElementType;
  isDefaultBrand: boolean;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          isDefaultBrand ? "bg-gradient-to-br from-accent to-brandLime" : "bg-accentSoft"
        }`}
      >
        <Icon size={18} className={isDefaultBrand ? "text-ink/80" : "text-accent"} aria-hidden="true" />
      </div>
      <div>
        <h4 className="font-display text-[15px] font-semibold text-ink">{title}</h4>
        <p className="mt-1 text-sm text-slate">{description}</p>
      </div>
      <Link
        href={href}
        className="mt-auto inline-flex w-fit items-center rounded-lg border border-border bg-surfaceMuted px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
