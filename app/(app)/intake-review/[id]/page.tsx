"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Intake = Record<string, any>;
type DocRequest = { id: string; item_key: string; item_title: string; is_required: boolean; is_blocking: boolean; status: string };
type Doc = { id: string; document_request_id: string; original_file_name: string; uploaded_at: string };
type PossibleMatch = {
  id: string;
  candidate_client_id: string;
  match_reason: string;
  clients: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;
};
type HistoryRow = { id: string; from_status: string | null; to_status: string; reason: string | null; occurred_at: string };
type ClientSearchRow = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null };
type ReasonableInquiry = {
  id: string;
  category: string;
  trigger_reason: string;
  client_question: string | null;
  client_response: string | null;
  status: "open" | "answered" | "resolved" | "dismissed";
  staff_note: string | null;
};

export default function IntakeReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [intake, setIntake] = useState<Intake | null>(null);
  const [docRequests, setDocRequests] = useState<DocRequest[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [matches, setMatches] = useState<PossibleMatch[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [inquiries, setInquiries] = useState<ReasonableInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reasonPrompt, setReasonPrompt] = useState<"decline" | "archive" | "info" | null>(null);
  const [reason, setReason] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientSearchRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: i }, { data: dr }, { data: d }, { data: pm }, { data: h }, { data: ri }] = await Promise.all([
      supabase.from("intakes").select("*").eq("id", id).maybeSingle(),
      supabase.from("intake_document_requests").select("*").eq("intake_id", id).order("sort_order"),
      supabase.from("intake_documents").select("*").eq("intake_id", id),
      supabase
        .from("intake_possible_matches")
        .select("id,candidate_client_id,match_reason,clients:candidate_client_id(id,first_name,last_name,email,phone)")
        .eq("intake_id", id)
        .eq("reviewed", false),
      supabase.from("intake_status_history").select("*").eq("intake_id", id).order("occurred_at"),
      supabase.from("intake_reasonable_inquiries").select("*").eq("intake_id", id).order("created_at"),
    ]);
    setIntake(i || null);
    setDocRequests((dr as DocRequest[]) || []);
    setDocs((d as Doc[]) || []);
    setMatches(((pm as unknown) as PossibleMatch[]) || []);
    setHistory((h as HistoryRow[]) || []);
    setInquiries((ri as ReasonableInquiry[]) || []);
    setLoading(false);
  }, [id]);

  async function resolveInquiry(inquiryId: string) {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("staff_resolve_intake_inquiry", { p_inquiry_id: inquiryId, p_note: null });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    await load();
  }

  useEffect(() => {
    load();
  }, [load]);

  async function act(status: string, reasonText?: string) {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("staff_set_intake_status", {
      p_intake_id: id,
      p_new_status: status,
      p_reason: reasonText || null,
    });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setReasonPrompt(null);
    setReason("");
    await load();
  }

  async function convertToProspective() {
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.rpc("staff_convert_intake_to_prospective_client", {
      p_intake_id: id,
    });
    setBusy(false);
    if (error || !data) {
      setNotice(error?.message || "Could not convert this intake.");
      return;
    }
    router.push(`/clients/${data}`);
  }

  async function matchClient(clientId: string) {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("staff_match_intake_to_client", {
      p_intake_id: id,
      p_client_id: clientId,
    });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    await load();
  }

  async function searchClients(q: string) {
    setClientQuery(q);
    if (q.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const { data } = await supabase
      .from("clients")
      .select("id,first_name,last_name,email,phone")
      .neq("status", "archived")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    setClientResults((data as ClientSearchRow[]) || []);
  }

  async function viewDocument(documentId: string) {
    const res = await fetch(`/api/intake/staff-document-url?documentId=${documentId}`);
    const json = await res.json();
    if (json.ok) window.open(json.url, "_blank");
    else setNotice(json.error || "Could not open that document.");
  }

  if (loading) return <div className="max-w-4xl mx-auto px-6 py-8 text-sm text-muted">Loading…</div>;
  if (!intake) return <div className="max-w-4xl mx-auto px-6 py-8 text-sm text-brick">Intake not found.</div>;

  const alreadyMatched = !!intake.matched_client_id;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <Link href="/intake-review" className="text-sm text-muted flex items-center gap-1">
        <ArrowLeft size={14} /> Back to queue
      </Link>

      <div>
        <h1 className="font-slab text-xl font-bold text-ink">
          {intake.intake_type === "business_entity"
            ? intake.legal_business_name || `${intake.contact_first_name} ${intake.contact_last_name}`
            : `${intake.contact_first_name} ${intake.contact_last_name}`}
        </h1>
        <p className="text-sm text-muted">
          {intake.intake_type === "business_entity" && (
            <>
              {String(intake.entity_classification || "").replace(/_/g, " ")} · Contact: {intake.contact_first_name}{" "}
              {intake.contact_last_name} ·{" "}
            </>
          )}
          Tax year {intake.tax_year} · {intake.is_returning_client ? "Returning client" : "New"} ·{" "}
          Status: <span className="font-semibold text-ink">{intake.status}</span>
        </p>
      </div>

      {notice && <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">{notice}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-line rounded-sm p-4 space-y-1 text-sm">
          <div className="font-semibold text-ink mb-1">Contact</div>
          <div>Email: {intake.contact_email || "—"} {intake.contact_email_verified && <span className="text-green">✓ verified</span>}</div>
          <div>Phone: {intake.contact_phone || "—"} {intake.contact_phone_verified && <span className="text-green">✓ verified</span>}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4 space-y-1 text-sm">
          <div className="font-semibold text-ink mb-1">Assessment</div>
          <div>Complexity: {intake.complexity_classification || "—"}</div>
          <div>Consultation recommended: {intake.consultation_recommended ? "Yes" : "No"}</div>
          <div>Payment preference: {intake.payment_preference || "—"}</div>
          {intake.review_flags?.length > 0 && (
            <div className="text-xs text-muted mt-1">Flags: {intake.review_flags.join(", ")}</div>
          )}
        </div>
      </div>

      {intake.intake_type === "business_entity" && (
        <div className="bg-white border border-line rounded-sm p-4 space-y-2 text-sm">
          <div className="font-semibold text-ink mb-1">Business summary</div>
          <div>
            Return type:{" "}
            {[
              intake.answers?.return_status?.is_initial === "yes" && "Initial",
              intake.answers?.return_status?.is_final === "yes" && "Final",
              intake.answers?.return_status?.needs_amendment === "yes" && "Amended",
              intake.answers?.return_status?.is_short_period === "yes" && "Short period",
            ]
              .filter(Boolean)
              .join(", ") || "Original"}
          </div>
          <div>Bookkeeping: {intake.answers?.bookkeeping?.status || "—"}</div>
          <div>
            States of operation: {Array.isArray(intake.states_lived_worked) ? intake.states_lived_worked.join(", ") || "—" : "—"}
          </div>
          <div>
            Ownership total: {intake.ownership_percentage_total != null ? `${intake.ownership_percentage_total}%` : "—"}
          </div>
          <div className="mt-2">
            <div className="text-xs font-semibold text-muted mb-1">Owners</div>
            {(intake.answers?.owners || []).length === 0 ? (
              <div className="text-xs text-muted">No owners recorded.</div>
            ) : (
              <div className="space-y-1">
                {(intake.answers.owners as any[]).map((o, i) => (
                  <div key={o.local_id || i} className="text-xs border-t border-line pt-1 first:border-t-0">
                    {o.full_name || `Owner ${i + 1}`} — {o.role || "role not set"} —{" "}
                    {typeof o.ownership_pct === "number" ? `${o.ownership_pct}%` : "% unknown"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-sm p-4">
        <div className="font-semibold text-ink text-sm mb-2">Answers (raw)</div>
        <pre className="text-xs text-muted whitespace-pre-wrap">{JSON.stringify(intake.answers, null, 2)}</pre>
      </div>

      <div className="bg-white border border-line rounded-sm p-4">
        <div className="font-semibold text-ink text-sm mb-2">Documents</div>
        <div className="space-y-1">
          {docRequests.map((dr) => {
            const uploaded = docs.filter((d) => d.document_request_id === dr.id);
            return (
              <div key={dr.id} className="flex items-center justify-between text-sm border-t border-line py-1.5 first:border-t-0">
                <span>
                  {dr.item_title} {dr.is_required && <span className="text-brick">*</span>} —{" "}
                  <span className="text-muted">{dr.status.replace(/_/g, " ")}</span>
                </span>
                <span className="flex gap-2">
                  {uploaded.map((u) => (
                    <button key={u.id} onClick={() => viewDocument(u.id)} className="text-xs text-blue underline">
                      {u.original_file_name}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!alreadyMatched && matches.length > 0 && (
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="font-semibold text-ink text-sm mb-2">Possible matches</div>
          {matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm border-t border-line py-2 first:border-t-0">
              <span>
                {m.clients?.first_name} {m.clients?.last_name} — {m.clients?.email || m.clients?.phone || "no contact on file"}
                <span className="text-xs text-muted ml-2">({m.match_reason})</span>
              </span>
              <button
                disabled={busy}
                onClick={() => matchClient(m.candidate_client_id)}
                className="text-xs font-semibold border border-line rounded-sm px-2 py-1"
              >
                Link to this client
              </button>
            </div>
          ))}
        </div>
      )}

      {!alreadyMatched && (
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="font-semibold text-ink text-sm mb-2">Search existing clients to match</div>
          <input
            value={clientQuery}
            onChange={(e) => searchClients(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm mb-2"
          />
          {clientResults.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm border-t border-line py-2 first:border-t-0">
              <span>{c.first_name} {c.last_name} — {c.email || c.phone || "—"}</span>
              <button
                disabled={busy}
                onClick={() => matchClient(c.id)}
                className="text-xs font-semibold border border-line rounded-sm px-2 py-1"
              >
                Link
              </button>
            </div>
          ))}
        </div>
      )}

      {alreadyMatched && (
        <div className="bg-white border border-line rounded-sm p-4 text-sm">
          <span className="font-semibold text-ink">Matched to client: </span>
          <Link href={`/clients/${intake.matched_client_id}`} className="text-blue underline">
            View client profile
          </Link>
        </div>
      )}

      {inquiries.length > 0 && (
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="font-semibold text-ink text-sm mb-2">Reasonable-inquiry follow-ups</div>
          <div className="space-y-2">
            {inquiries.map((q) => (
              <div key={q.id} className="border-t border-line pt-2 first:border-t-0 first:pt-0 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{q.category.replace(/_/g, " ")}</span>
                  <span
                    className={
                      q.status === "resolved"
                        ? "text-xs text-green"
                        : q.status === "answered"
                          ? "text-xs text-blue"
                          : "text-xs text-amber"
                    }
                  >
                    {q.status}
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">{q.trigger_reason}</p>
                {q.client_question && <p className="text-xs text-ink mt-1">Asked client: {q.client_question}</p>}
                {q.client_response && <p className="text-xs text-green mt-1">Client response: {q.client_response}</p>}
                {q.status !== "resolved" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resolveInquiry(q.id)}
                    className="text-xs font-semibold text-blue underline mt-1"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-sm p-4">
        <div className="font-semibold text-ink text-sm mb-2">Status history</div>
        {history.map((h) => (
          <div key={h.id} className="text-xs text-muted border-t border-line py-1 first:border-t-0">
            {new Date(h.occurred_at).toLocaleString()} — {h.from_status || "start"} → {h.to_status}
            {h.reason && <span> ({h.reason})</span>}
          </div>
        ))}
      </div>

      {reasonPrompt && (
        <div className="bg-white border border-line rounded-sm p-4 space-y-2">
          <div className="text-sm font-semibold text-ink">
            {reasonPrompt === "decline" ? "Reason for declining" : reasonPrompt === "archive" ? "Reason for archiving" : "What's still needed?"}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() =>
                act(
                  reasonPrompt === "decline" ? "declined" : reasonPrompt === "archive" ? "archived" : "additional_information_needed",
                  reason,
                )
              }
              className="bg-ink text-white text-sm font-semibold px-3 py-2 rounded-sm"
            >
              Confirm
            </button>
            <button onClick={() => setReasonPrompt(null)} className="text-sm text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={() => act("quote_pending")} disabled={busy}>
          Accept for Quote Process
        </ActionButton>
        <ActionButton onClick={() => act("consultation_required")} disabled={busy}>
          Require Consultation
        </ActionButton>
        <ActionButton onClick={() => setReasonPrompt("info")} disabled={busy}>
          Request More Information
        </ActionButton>
        <ActionButton onClick={convertToProspective} disabled={busy}>
          {alreadyMatched ? "Open Client Profile" : "Create Prospective Client"}
        </ActionButton>
        <ActionButton onClick={() => setReasonPrompt("decline")} disabled={busy} danger>
          Decline
        </ActionButton>
        <ActionButton onClick={() => setReasonPrompt("archive")} disabled={busy} danger>
          Archive
        </ActionButton>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm font-semibold px-3 py-2 rounded-sm border disabled:opacity-50"
      style={{
        backgroundColor: danger ? "white" : "#172622",
        color: danger ? "#B3261E" : "white",
        borderColor: danger ? "#B3261E" : "#172622",
      }}
    >
      {children}
    </button>
  );
}
