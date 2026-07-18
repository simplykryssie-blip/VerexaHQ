"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { supabasePortal } from "@/lib/supabasePortal";
import { usePortal } from "@/components/portal/PortalContext";
import type {
  TaxOrganizerAssignment,
  TaxOrganizerTemplate,
  ClientPortalTodo,
  BookkeepingReportDelivery,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";

type AssignmentRow = TaxOrganizerAssignment & { templateName: string };

export default function PortalHomePage() {
  const { access } = usePortal();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [todos, setTodos] = useState<ClientPortalTodo[]>([]);
  const [reports, setReports] = useState<BookkeepingReportDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!access) return;
    async function load() {
      setLoading(true);
      const [assignmentsRes, todosRes, reportsRes] = await Promise.all([
        supabasePortal
          .from("tax_organizer_assignments")
          .select("*")
          .eq("client_id", access!.client_id)
          .order("created_at", { ascending: false }),
        supabasePortal
          .from("client_portal_todos")
          .select("*")
          .eq("client_id", access!.client_id)
          .eq("client_visible", true)
          .neq("todo_status", "completed")
          .order("due_date", { ascending: true }),
        supabasePortal
          .from("bookkeeping_report_deliveries")
          .select("*")
          .eq("client_id", access!.client_id)
          .in("report_status", ["delivered", "client_viewed"])
          .order("delivered_at", { ascending: false }),
      ]);

      const assignmentList = (assignmentsRes.data as TaxOrganizerAssignment[]) ?? [];
      const templateIds = Array.from(new Set(assignmentList.map((a) => a.template_id)));
      let templatesMap = new Map<string, string>();
      if (templateIds.length > 0) {
        const { data: templatesData } = await supabasePortal
          .from("tax_organizer_templates")
          .select("id, template_name")
          .in("id", templateIds);
        (templatesData as Pick<TaxOrganizerTemplate, "id" | "template_name">[] | null)?.forEach(
          (t) => templatesMap.set(t.id, t.template_name)
        );
      }

      setAssignments(
        assignmentList.map((a) => ({
          ...a,
          templateName: templatesMap.get(a.template_id) ?? "Tax Organizer",
        }))
      );
      setTodos((todosRes.data as ClientPortalTodo[]) ?? []);
      setReports((reportsRes.data as BookkeepingReportDelivery[]) ?? []);
      setLoading(false);
    }
    load();
  }, [access]);

  async function downloadReport(report: BookkeepingReportDelivery) {
    if (!report.document_id) return;
    const { data: doc } = await supabasePortal
      .from("documents")
      .select("storage_path")
      .eq("id", report.document_id)
      .maybeSingle();
    if (!doc?.storage_path) return;
    const { data, error } = await supabasePortal.storage
      .from("firmflow-client-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  if (!access) return null;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
          Welcome
        </div>
        <h1 className="font-slab text-2xl font-bold text-ink">{access.client_name}</h1>
      </div>

      <section>
        <div className="border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Tax Organizers</h2>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {loading && <div className="px-5 py-5 text-sm text-muted">Loading…</div>}
          {!loading && assignments.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">
              Nothing here yet — your accountant will assign an organizer when it&apos;s
              time to gather your tax information.
            </div>
          )}
          {assignments.map((a) => (
            <Link
              key={a.id}
              href={`/portal/organizer/${a.id}`}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">{a.templateName}</div>
                <div className="text-xs text-muted mt-0.5">
                  {a.due_date ? `Due ${a.due_date}` : "No due date"}
                </div>
              </div>
              <StatusPill status={a.assignment_status} />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">To-Dos</h2>
          <Link href="/portal/todos" className="text-xs font-semibold text-ink">
            View all →
          </Link>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {loading && <div className="px-5 py-5 text-sm text-muted">Loading…</div>}
          {!loading && todos.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">You&apos;re all caught up.</div>
          )}
          {todos.slice(0, 5).map((t) => (
            <div key={t.id} className="px-5 py-3.5">
              <div className="font-semibold text-ink text-sm">{t.title}</div>
              {t.due_date && <div className="text-xs text-muted mt-0.5">Due {t.due_date}</div>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Reports</h2>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {loading && <div className="px-5 py-5 text-sm text-muted">Loading…</div>}
          {!loading && reports.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">
              No reports delivered yet — your bookkeeper will share monthly
              reports here once they&apos;re ready.
            </div>
          )}
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-ink text-sm">{r.report_title}</div>
                <div className="text-xs text-muted mt-0.5">
                  {r.report_type.replaceAll("_", " ")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={r.report_status.replaceAll("_", " ")} />
                {r.document_id && (
                  <button
                    onClick={() => downloadReport(r)}
                    className="text-muted hover:text-ink"
                  >
                    <Download size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
