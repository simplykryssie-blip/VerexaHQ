"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import SendInvitationModal from "@/components/earlyAccess/SendInvitationModal";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { ApplicationStatus, EarlyAccessApplication, EarlyAccessCampaign } from "@/lib/earlyAccess/types";

const STATUS_OPTIONS: (ApplicationStatus | "all")[] = [
  "all",
  "pending",
  "under_review",
  "approved",
  "waitlisted",
  "rejected",
  "withdrawn",
];

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const style: Record<ApplicationStatus, string> = {
    pending: "bg-amber-50 text-amber-700",
    under_review: "bg-blue-50 text-blue-700",
    approved: "bg-emerald-50 text-emerald-700",
    waitlisted: "bg-purple-50 text-purple-700",
    rejected: "bg-brick/10 text-brick",
    withdrawn: "bg-paper text-muted",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function ApplicationsPageInner() {
  const searchParams = useSearchParams();
  const { showSuccess, showError } = useToast();

  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [applications, setApplications] = useState<EarlyAccessApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    (searchParams.get("status") as ApplicationStatus | null) ?? "all",
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EarlyAccessApplication | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    label: string;
    nextStatus: ApplicationStatus;
    destructive: boolean;
  } | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: campaignRow, error: campaignError } = await supabase
      .from("early_access_campaigns")
      .select("*")
      .eq("slug", "verexahq-v0-2-founding-firm-beta")
      .maybeSingle();
    if (campaignError || !campaignRow) {
      setError(friendlyError(campaignError, "Couldn't load the Early Access campaign."));
      setLoading(false);
      return;
    }
    const c = campaignRow as EarlyAccessCampaign;
    setCampaign(c);

    const { data, error: appError } = await supabase
      .from("early_access_applications")
      .select("*")
      .eq("campaign_id", c.id)
      .order("submitted_at", { ascending: false });

    if (appError) {
      setError(friendlyError(appError, "Couldn't load applications."));
      setLoading(false);
      return;
    }
    setApplications((data as EarlyAccessApplication[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return applications.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const t = search.trim().toLowerCase();
      return (
        a.firm_name.toLowerCase().includes(t) ||
        a.owner_name.toLowerCase().includes(t) ||
        a.email.toLowerCase().includes(t)
      );
    });
  }, [applications, statusFilter, search]);

  function openDetail(app: EarlyAccessApplication) {
    setSelected(app);
    setNotesDraft(app.reviewer_notes ?? "");
  }

  async function saveNotes() {
    if (!selected) return;
    setSavingNotes(true);
    const { error: updateError } = await supabase
      .from("early_access_applications")
      .update({ reviewer_notes: notesDraft })
      .eq("id", selected.id);
    setSavingNotes(false);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't save reviewer notes."));
      return;
    }
    showSuccess("Reviewer notes saved.");
    setApplications((prev) =>
      prev.map((a) => (a.id === selected.id ? { ...a, reviewer_notes: notesDraft } : a)),
    );
    setSelected((prev) => (prev ? { ...prev, reviewer_notes: notesDraft } : prev));
  }

  async function applyStatusChange(nextStatus: ApplicationStatus) {
    if (!selected || !campaign) return;
    setStatusBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error: updateError } = await supabase
      .from("early_access_applications")
      .update({
        status: nextStatus,
        reviewed_by: sessionData.session?.user.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", selected.id);
    setStatusBusy(false);
    setConfirmAction(null);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't update the application status."));
      return;
    }
    showSuccess(`Application marked ${nextStatus.replaceAll("_", " ")}.`);
    void logAdminActivity({
      campaignId: campaign.id,
      action: "application_status_changed",
      entityType: "early_access_application",
      entityId: selected.id,
      details: { from: selected.status, to: nextStatus },
    });
    setApplications((prev) =>
      prev.map((a) => (a.id === selected.id ? { ...a, status: nextStatus } : a)),
    );
    setSelected((prev) => (prev ? { ...prev, status: nextStatus } : prev));
  }

  if (loading) return <p className="text-muted">Loading applications…</p>;
  if (error) {
    return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  }
  if (!campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        No Early Access campaign found.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search firm, owner, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-line py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "all")}
          className="rounded-xl border border-line px-3 py-2 text-sm capitalize"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No applications match this filter.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Firm</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Team size</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => openDetail(a)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                >
                  <td className="px-4 py-3 font-semibold text-ink">{a.firm_name}</td>
                  <td className="px-4 py-3 text-ink">{a.owner_name}</td>
                  <td className="px-4 py-3 text-muted">{a.email}</td>
                  <td className="px-4 py-3 text-muted">{a.team_size ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{new Date(a.submitted_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/30">
          <button aria-label="Close" className="absolute inset-0" onClick={() => setSelected(null)} tabIndex={-1} />
          <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">{selected.firm_name}</h2>
                <p className="text-sm text-muted">{selected.owner_name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="mt-2">
              <StatusBadge status={selected.status} />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Field label="Email" value={selected.email} />
              <Field label="Phone" value={selected.phone ?? "—"} />
              <Field label="Website" value={selected.website ?? "—"} />
              <Field label="Location" value={[selected.state_region, selected.country].filter(Boolean).join(", ") || "—"} />
              <Field label="Team size" value={selected.team_size?.toString() ?? "—"} />
              <Field label="Approx. clients" value={selected.approximate_client_count?.toString() ?? "—"} />
              <Field label="Current CRM" value={selected.current_crm ?? "—"} />
              <Field label="Attend calls" value={selected.willing_to_attend_calls === null ? "—" : selected.willing_to_attend_calls ? "Yes" : "No"} />
            </div>

            {selected.services.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Services</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selected.services.map((s) => (
                    <span key={s} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-ink">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selected.biggest_frustration && (
              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Biggest frustration</div>
                <p className="mt-1 text-sm text-ink">{selected.biggest_frustration}</p>
              </div>
            )}
            {selected.desired_feature && (
              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Desired feature</div>
                <p className="mt-1 text-sm text-ink">{selected.desired_feature}</p>
              </div>
            )}

            <div className="mt-5">
              <label className="text-xs font-bold uppercase tracking-wide text-muted">Reviewer notes</label>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm"
                placeholder="Internal notes about this application…"
              />
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
              >
                {savingNotes ? "Saving…" : "Save notes"}
              </button>
            </div>

            <div className="mt-6 space-y-2 border-t border-line pt-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={selected.status === "approved"}
                  onClick={() => setConfirmAction({ label: "Approve this application?", nextStatus: "approved", destructive: false })}
                  className="rounded-xl bg-[#108A64] py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  disabled={selected.status === "waitlisted"}
                  onClick={() => setConfirmAction({ label: "Waitlist this application?", nextStatus: "waitlisted", destructive: false })}
                  className="rounded-xl border border-line py-2 text-sm font-semibold text-ink disabled:opacity-40"
                >
                  Waitlist
                </button>
                <button
                  disabled={selected.status === "rejected"}
                  onClick={() => setConfirmAction({ label: "Reject this application?", nextStatus: "rejected", destructive: true })}
                  className="rounded-xl border border-line py-2 text-sm font-semibold text-brick disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  disabled={selected.status === "under_review"}
                  onClick={() => setConfirmAction({ label: "Return this application to review?", nextStatus: "under_review", destructive: false })}
                  className="rounded-xl border border-line py-2 text-sm font-semibold text-ink disabled:opacity-40"
                >
                  Return to review
                </button>
              </div>
              <button
                onClick={() => setShowInvite(true)}
                className="w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white"
              >
                Send invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmAction.label}
          destructive={confirmAction.destructive}
          busy={statusBusy}
          confirmLabel="Confirm"
          onConfirm={() => applyStatusChange(confirmAction.nextStatus)}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {showInvite && selected && campaign && (
        <SendInvitationModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          applicationId={selected.id}
          defaultEmail={selected.email}
          onClose={() => setShowInvite(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-ink">{value}</div>
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading applications…</p>}>
      <ApplicationsPageInner />
    </Suspense>
  );
}
