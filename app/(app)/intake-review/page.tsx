"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabase";

type IntakeListRow = {
  id: string;
  status: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  tax_year: number;
  is_returning_client: boolean;
  contact_email_verified: boolean;
  contact_phone_verified: boolean;
  has_possible_matches: boolean;
  complexity_classification: string | null;
  consultation_recommended: boolean;
  assigned_to: string | null;
  submitted_at: string | null;
  created_at: string;
};

const NEEDS_ATTENTION = new Set(["intake_review_needed", "additional_information_needed"]);

const STATUS_LABELS: Record<string, string> = {
  intake_started: "Started",
  intake_in_progress: "In progress",
  verification_pending: "Verifying",
  intake_submitted: "Submitted",
  intake_review_needed: "Review needed",
  additional_information_needed: "Info requested",
  consultation_required: "Consultation required",
  consultation_scheduled: "Consultation scheduled",
  quote_pending: "Quote pending",
  declined: "Declined",
  archived: "Archived",
  withdrawn: "Withdrawn",
};

export default function IntakeReviewQueuePage() {
  const router = useRouter();
  const [rows, setRows] = useState<IntakeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"needs_attention" | "all">("needs_attention");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("intakes")
        .select(
          "id,status,contact_first_name,contact_last_name,tax_year,is_returning_client,contact_email_verified,contact_phone_verified,has_possible_matches,complexity_classification,consultation_recommended,assigned_to,submitted_at,created_at",
        )
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      setRows((data as IntakeListRow[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => NEEDS_ATTENTION.has(r.status))),
    [rows, filter],
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList size={22} className="text-ink" />
        <div>
          <h1 className="font-slab text-xl font-bold text-ink">Intake Review</h1>
          <p className="text-sm text-muted">Public tax-intake submissions awaiting a decision.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(["needs_attention", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
            style={{
              backgroundColor: filter === f ? "#172622" : "white",
              color: filter === f ? "white" : "#60716B",
              borderColor: "#DDEAE5",
            }}
          >
            {f === "needs_attention" ? "Needs attention" : "All intakes"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted">No intakes here right now.</div>
      ) : (
        <div className="bg-white border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paperDim text-xs text-muted uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Tax year</th>
                <th className="text-left px-4 py-2">New/Returning</th>
                <th className="text-left px-4 py-2">Verified</th>
                <th className="text-left px-4 py-2">Complexity</th>
                <th className="text-left px-4 py-2">Match</th>
                <th className="text-left px-4 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/intake-review/${r.id}`)}
                  className="border-t border-line cursor-pointer hover:bg-paperDim"
                >
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {r.contact_first_name} {r.contact_last_name}
                  </td>
                  <td className="px-4 py-2.5">{STATUS_LABELS[r.status] || r.status}</td>
                  <td className="px-4 py-2.5">{r.tax_year}</td>
                  <td className="px-4 py-2.5">{r.is_returning_client ? "Returning" : "New"}</td>
                  <td className="px-4 py-2.5">
                    {r.contact_email_verified || r.contact_phone_verified ? (
                      <span className="text-green">Verified</span>
                    ) : (
                      <span className="text-muted">Unverified</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.complexity_classification}
                    {r.consultation_recommended && (
                      <span className="ml-1 text-[10px] text-amber">consult</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.has_possible_matches && <span className="text-amber text-xs">Possible match</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
