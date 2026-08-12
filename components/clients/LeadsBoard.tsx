"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Phone, X, CalendarPlus, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { ensurePortalInvite } from "@/lib/portal/ensurePortalInvite";
import { renderEmail } from "@/lib/email/template";
import { ConvertLeadButton } from "@/app/(app)/clients/[id]/ConvertLeadButton";
import { AddAppointmentForm } from "@/app/(app)/clients/[id]/AddAppointmentForm";

export type LeadRow = {
  id: string;
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  lifecycle_status: string;
};

type OrganizerTemplate = { id: string; name: string };
export type LeadStage = { key: string; label: string };

function leadName(l: LeadRow) {
  if (l.client_type === "business" && l.business_name) return l.business_name;
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed lead";
}

/**
 * A lead is just a name in a list -- no stages to move it through. Clicking one opens a
 * side panel with two things staff can do: schedule an appointment or accept them as a
 * client. Scheduling doesn't change anything about their status; accepting is the one
 * action that does. Both ensure a portal invite exists, since a client can't see a booked
 * appointment or complete a template without portal access, and staff shouldn't have to
 * remember to invite them separately.
 */
export function LeadsBoard({
  leads,
  organizerTemplates,
  workspaceId,
  stages,
}: {
  leads: LeadRow[];
  organizerTemplates: OrganizerTemplate[];
  workspaceId: string;
  stages: LeadStage[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [booking, setBooking] = useState(false);
  const [sendingOrganizer, setSendingOrganizer] = useState(false);
  const [organizerTemplateId, setOrganizerTemplateId] = useState("");
  const [organizerSent, setOrganizerSent] = useState(false);

  const stageLabelByKey = new Map(stages.map((s) => [s.key, s.label]));

  useEffect(() => {
    setBooking(false);
    setSendingOrganizer(false);
    setOrganizerSent(false);
    setOrganizerTemplateId("");
  }, [selected?.id]);

  async function afterConsultBooked(lead: LeadRow) {
    await ensurePortalInvite(supabase, { clientId: lead.id, workspaceId, name: leadName(lead), email: lead.primary_email });
  }

  async function sendOrganizer(lead: LeadRow) {
    if (!organizerTemplateId) return;
    setSendingOrganizer(true);
    const template = organizerTemplates.find((t) => t.id === organizerTemplateId);
    const { error } = await supabase.from("organizer_responses").insert({
      workspace_id: workspaceId,
      client_id: lead.id,
      organizer_template_id: organizerTemplateId,
    });
    if (error) {
      setSendingOrganizer(false);
      window.alert(error.message);
      return;
    }

    await ensurePortalInvite(supabase, { clientId: lead.id, workspaceId, name: leadName(lead), email: lead.primary_email });

    if (lead.primary_email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: lead.primary_email,
          sender: "notifications",
          subject: `New organizer to complete: ${template?.name ?? ""}`,
          html: renderEmail({
            heading: "An organizer is ready for you",
            bodyHtml: `<p>Please log in to your client portal and complete the <strong>${template?.name ?? "organizer"}</strong> when you have a chance.</p>`,
            ctaLabel: "Go to portal",
            ctaUrl: `${appUrl}/portal/organizer`,
          }),
        }),
      });
    }

    setSendingOrganizer(false);
    setOrganizerSent(true);
    router.refresh();
  }

  return (
    <>
      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted">No leads yet.</p>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <button key={lead.id} type="button" onClick={() => setSelected(lead)} className="block w-full text-left">
              <Card className="flex items-center justify-between gap-3 p-3 transition hover:border-accent hover:shadow-sm">
                <div>
                  <p className="truncate text-sm font-medium text-ink">{leadName(lead)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{lead.primary_email ?? lead.primary_phone ?? "No contact info"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                  {stageLabelByKey.get(lead.lifecycle_status) ?? "Lead"}
                </span>
              </Card>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} aria-hidden="true" />
          <div className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted capitalize">{selected.client_type}</p>
                <h2 className="mt-0.5 text-base font-semibold text-ink">{leadName(selected)}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="rounded p-1 text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                {selected.primary_email && (
                  <a href={`mailto:${selected.primary_email}`} className="flex items-center gap-2 text-sm text-accent hover:underline">
                    <Mail size={14} /> {selected.primary_email}
                  </a>
                )}
                {selected.primary_phone && (
                  <a href={`tel:${selected.primary_phone}`} className="flex items-center gap-2 text-sm text-accent hover:underline">
                    <Phone size={14} /> {selected.primary_phone}
                  </a>
                )}
                {!selected.primary_email && !selected.primary_phone && <p className="text-sm text-muted">No contact info on file yet.</p>}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Choose next step</p>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border p-3">
                    <ConvertLeadButton
                      clientId={selected.id}
                      workspaceId={workspaceId}
                      lifecycleStatus={selected.lifecycle_status}
                      name={leadName(selected)}
                      email={selected.primary_email}
                    />
                    <p className="mt-1.5 text-xs text-muted">Moves them from lead to client. Sends a portal invite if they don&apos;t have one yet.</p>
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    {!booking ? (
                      <button
                        type="button"
                        onClick={() => setBooking(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accentSoft"
                      >
                        <CalendarPlus size={14} /> Schedule an Appointment
                      </button>
                    ) : (
                      <AddAppointmentForm
                        clientId={selected.id}
                        workspaceId={workspaceId}
                        onCreated={() => afterConsultBooked(selected)}
                        defaultOpen
                      />
                    )}
                    <p className="mt-1.5 text-xs text-muted">Doesn&apos;t change their stage. Sends a portal invite if they don&apos;t have one yet.</p>
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    {organizerTemplates.length === 0 ? (
                      <p className="text-xs text-muted">No organizer templates published yet -- add one in Templates first.</p>
                    ) : organizerSent ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                        <BookOpen size={14} /> Organizer sent.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={organizerTemplateId}
                          onChange={(e) => setOrganizerTemplateId(e.target.value)}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        >
                          <option value="">Choose an organizer...</option>
                          {organizerTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => sendOrganizer(selected)}
                          disabled={!organizerTemplateId || sendingOrganizer}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                        >
                          <BookOpen size={14} /> {sendingOrganizer ? "Sending..." : "Send Organizer"}
                        </button>
                      </div>
                    )}
                    <p className="mt-1.5 text-xs text-muted">Stays a lead. Sends a portal invite if they don&apos;t have one yet.</p>
                  </div>
                </div>
              </div>

              <Link
                href={`/engagements/new?clientId=${selected.id}`}
                className="text-xs font-medium text-muted hover:text-ink"
              >
                Ready for real work? Start an engagement &rarr;
              </Link>
              <Link href={`/clients/${selected.id}`} className="block text-xs font-medium text-muted hover:text-ink">
                Open full profile &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
