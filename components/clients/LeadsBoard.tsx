"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Phone, X, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { ConvertLeadButton } from "@/app/(app)/clients/[id]/ConvertLeadButton";

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

const STAGES = [
  { key: "lead", label: "Lead" },
  { key: "consult_scheduled", label: "Consult Scheduled" },
  { key: "proposal_sent", label: "Proposal Sent" },
] as const;

function leadName(l: LeadRow) {
  if (l.client_type === "business" && l.business_name) return l.business_name;
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed lead";
}

/**
 * A lead is a card you move through stages without leaving the board -- clicking one opens
 * a side panel instead of navigating to a full profile page. The board stays put; you act,
 * then move to the next card. That's the flow gap the old list+full-page-profile pattern had.
 */
export function LeadsBoard({ leads }: { leads: LeadRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [moving, setMoving] = useState(false);

  async function moveStage(lead: LeadRow, stage: string) {
    setMoving(true);
    const { error } = await supabase.from("clients").update({ lifecycle_status: stage }).eq("id", lead.id);
    setMoving(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    setSelected((prev) => (prev ? { ...prev, lifecycle_status: stage } : prev));
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const items = leads.filter((l) => l.lifecycle_status === stage.key);
          return (
            <div key={stage.key} className="w-72 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{stage.label}</h3>
                <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 && <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">Nothing here.</p>}
                {items.map((lead) => (
                  <button key={lead.id} type="button" onClick={() => setSelected(lead)} className="block w-full text-left">
                    <Card className="p-3 transition hover:border-accent hover:shadow-sm">
                      <p className="truncate text-sm font-medium text-ink">{leadName(lead)}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{lead.primary_email ?? lead.primary_phone ?? "No contact info"}</p>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

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
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Move to</p>
                <div className="flex flex-wrap gap-2">
                  {STAGES.filter((s) => s.key !== selected.lifecycle_status).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => moveStage(selected, s.key)}
                      disabled={moving}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
                    >
                      {s.label} <ArrowRight size={12} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surfaceMuted p-4">
                <p className="text-sm font-medium text-ink">Ready to move forward?</p>
                <p className="mt-1 text-xs text-muted">Accepting turns this lead into a client. Starting an engagement does that automatically too.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ConvertLeadButton clientId={selected.id} lifecycleStatus={selected.lifecycle_status} />
                  <Link
                    href={`/engagements/new?clientId=${selected.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
                  >
                    Start an engagement
                  </Link>
                </div>
              </div>

              <Link href={`/clients/${selected.id}`} className="text-xs font-medium text-muted hover:text-ink">
                Open full profile &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
