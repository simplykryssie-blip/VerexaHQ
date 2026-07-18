"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TaxOrganizerAssignment, TaxOrganizerTemplate, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import AssignOrganizerModal from "@/components/AssignOrganizerModal";

type AssignmentRow = TaxOrganizerAssignment & { clientName: string; templateName: string };

export default function OrganizersPage() {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tax_organizer_assignments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const list = (data as TaxOrganizerAssignment[]) ?? [];
    const clientIds = Array.from(new Set(list.map((a) => a.client_id)));
    const templateIds = Array.from(new Set(list.map((a) => a.template_id)));

    const [clientsRes, templatesRes] = await Promise.all([
      clientIds.length > 0
        ? supabase
            .from("clients")
            .select("id, first_name, last_name, business_name, client_type")
            .in("id", clientIds)
        : Promise.resolve({ data: [] as Client[] }),
      templateIds.length > 0
        ? supabase.from("tax_organizer_templates").select("id, template_name").in("id", templateIds)
        : Promise.resolve({ data: [] as Pick<TaxOrganizerTemplate, "id" | "template_name">[] }),
    ]);

    const clientsMap = new Map<string, string>();
    (clientsRes.data as Client[] | null)?.forEach((c) => {
      const name =
        c.client_type === "business" && c.business_name
          ? c.business_name
          : `${c.first_name} ${c.last_name}`.trim();
      clientsMap.set(c.id, name);
    });
    const templatesMap = new Map<string, string>();
    (templatesRes.data as { id: string; template_name: string }[] | null)?.forEach((t) =>
      templatesMap.set(t.id, t.template_name)
    );

    setRows(
      list.map((a) => ({
        ...a,
        clientName: clientsMap.get(a.client_id) ?? "—",
        templateName: templatesMap.get(a.template_id) ?? "—",
      }))
    );
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Client Intake
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Tax Organizers</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/tax"
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            Tax Returns
          </Link>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white">
            Organizers
          </span>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
          >
            <Plus size={15} /> Assign Organizer
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-sm border border-line bg-white px-4 py-3 text-sm text-muted">
        Organizers collect the client&apos;s answers and documents before preparation.
        VerexaHQ reuses known client identity and contact details, links the organizer to
        the same client tax-year record, and leaves financial amounts for the client or
        staff to enter only once.
      </div>

      {showModal && (
        <AssignOrganizerModal onClose={() => setShowModal(false)} onSaved={load} />
      )}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {loading && <div className="px-5 py-6 text-sm text-muted">Loading organizers…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted">
            No organizers assigned yet. Click &quot;Assign Organizer&quot; to send your
            first one.
          </div>
        )}
        {rows.map((a) => (
          <Link
            key={a.id}
            href={`/tax/organizers/${a.id}`}
            className="flex flex-col gap-2 px-5 py-3.5 hover:bg-paper transition-colors sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-semibold text-ink text-sm">{a.clientName}</div>
              <div className="text-xs text-muted mt-0.5">{a.templateName}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="text-xs tabular-nums font-mono text-muted">
                {a.due_date ? `Due ${a.due_date}` : "No due date"}
              </span>
              <StatusPill status={a.assignment_status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
