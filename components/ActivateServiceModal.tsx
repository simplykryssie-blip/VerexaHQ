"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import DateField from "@/components/DateField";
import { friendlyError } from "@/lib/friendlyError";
import { listActiveStaff, type StaffOption } from "@/lib/workspaceMembers";

// engagements.priority is a real live enum (engagement_priority).
const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  process_id: string | null;
  requires_organizer: boolean;
  requires_documents: boolean;
  requires_signature: boolean;
  requires_review: boolean;
  requires_invoice: boolean;
};

type ProcessStage = { id: string; name: string; display_order: number };

type Step = 1 | 2;
const STEP_LABELS: Record<Step, string> = { 1: "Service", 2: "Review" };

export default function ActivateServiceModal({
  clientId,
  workspaceId,
  onClose,
  onActivated,
}: {
  clientId: string;
  workspaceId: string;
  onClose: () => void;
  // Called once, right before this component calls onClose() itself, with
  // the name of the service that was just activated — the parent uses
  // this to refresh its own data and show a success message.
  onActivated: (serviceName: string) => void;
}) {
  const [step, setStep] = useState<Step>(1);

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("");
  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [stageId, setStageId] = useState("");

  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);

  const [setupError, setSetupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The real workspace catalog of services (id, name, process_id, ...
  // requires_* flags) — not a per-client instance table. Only published
  // services are offerable.
  useEffect(() => {
    supabase
      .from("services")
      .select(
        "id, name, description, process_id, requires_organizer, requires_documents, requires_signature, requires_review, requires_invoice",
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .order("display_order")
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setServicesError(friendlyError(queryError, "Couldn't load services. Please try again."));
          setServices([]);
          return;
        }
        setServicesError(null);
        setServices((data as ServiceOption[]) ?? []);
      });
  }, [workspaceId]);

  useEffect(() => {
    listActiveStaff(workspaceId).then(setStaff);
  }, [workspaceId]);

  // Real, workspace-configured stages for the chosen service's process —
  // the live replacement for the old (fabricated) pipeline-stage picker,
  // which was tied to a service_templates.default_pipeline_id that never
  // existed live. Defaults to the first stage by display_order, same as a
  // new engagement's current_stage would be set to on activation.
  useEffect(() => {
    if (!selectedService?.process_id) {
      setStages([]);
      setStageId("");
      return;
    }
    supabase
      .from("process_stages")
      .select("id, name, display_order")
      .eq("process_id", selectedService.process_id)
      .order("display_order")
      .then(({ data }) => {
        const list = (data as ProcessStage[]) ?? [];
        setStages(list);
        setStageId(list[0]?.id ?? "");
      });
  }, [selectedService?.process_id]);

  function goToReview() {
    if (!serviceId) {
      setSetupError("Choose a service.");
      return;
    }
    setSetupError(null);
    setStep(2);
  }

  // No RPC creates an engagement from a service — confirmed live (no
  // apply_service_template_to_client, no other engagement-creation RPC).
  // This is a direct insert into `engagements`, the same real path already
  // built for the sibling tax-CRM engagement form against this same
  // database. Triggers on engagements handle the rest: engagement_number
  // (trg_generate_engagement_number), default staff/reviewer/compliance
  // assignment from the client's relationship_manager_id/etc when not set
  // here (trg_prefill_engagement_assignments, apply_engagement_default_assignment),
  // and document-folder creation from the service's document_folder_template_id
  // (trg_apply_document_folder_template).
  async function activate() {
    if (!selectedService) return;
    setSaving(true);
    setError(null);

    const stageName = stages.find((s) => s.id === stageId)?.name ?? null;

    const { error: insertError } = await supabase.from("engagements").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      service_id: selectedService.id,
      workflow_id: selectedService.process_id,
      current_stage: stageName,
      priority,
      due_date: dueDate || null,
      internal_reference: internalReference || null,
      assigned_staff_id: assignedTo || null,
    });

    setSaving(false);
    if (insertError) {
      setError(friendlyError(insertError, "Something went wrong activating this service. Please try again."));
      return;
    }

    onActivated(selectedService.name);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border border-line bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-slab text-lg font-bold text-ink">Activate a service</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-muted sm:text-[11px]">
          {([1, 2] as Step[]).map((n, idx) => (
            <span key={n} className="flex items-center gap-1.5">
              <span className={step >= n ? "text-[#108A64]" : ""}>
                {n}. {STEP_LABELS[n]}
              </span>
              {idx < 1 && <ChevronRight size={11} />}
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            {servicesError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{servicesError}</div>
            )}
            {!servicesError && services.length === 0 && (
              <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
                No services are set up for this workspace yet.
              </div>
            )}
            <div className="space-y-2">
              {services.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                    serviceId === s.id ? "border-[#108A64] bg-emerald-50/40" : "border-line"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{s.name}</div>
                    {s.description && <div className="mt-0.5 text-xs text-muted">{s.description}</div>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.requires_organizer && <Badge>Organizer</Badge>}
                      {s.requires_documents && <Badge>Documents</Badge>}
                      {s.requires_signature && <Badge>Signature</Badge>}
                      {s.requires_review && <Badge>Review</Badge>}
                      {s.requires_invoice && <Badge>Invoice</Badge>}
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="service"
                    checked={serviceId === s.id}
                    onChange={() => setServiceId(s.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#108A64]"
                  />
                </label>
              ))}
            </div>

            {serviceId && (
              <div className="space-y-3 border-t border-line pt-3">
                {stages.length > 0 && (
                  <Field label="Starting stage">
                    <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm">
                      {stages.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {idx === 0 ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Priority">
                    <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm">
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Due date (optional)">
                    <DateField value={dueDate} onChange={setDueDate} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
                  </Field>
                </div>

                <Field label="Internal reference (optional)">
                  <input
                    placeholder="Staff-only reference, not shown to the client"
                    value={internalReference}
                    onChange={(e) => setInternalReference(e.target.value)}
                    className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                  />
                </Field>

                {staff.length > 0 && (
                  <Field label="Assigned team member (optional)">
                    <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm">
                      <option value="">Unassigned (defaults to the client&apos;s relationship manager, if set)</option>
                      {staff.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            )}

            {setupError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{setupError}</div>
            )}

            <div className="flex justify-end pt-2">
              <button disabled={!serviceId} onClick={goToReview} className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && selectedService && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-line bg-paper p-4 text-sm">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Service</div>
                <ReviewRow label="Service" value={selectedService.name} />
                <ReviewRow label="Starting stage" value={stages.find((s) => s.id === stageId)?.name ?? "No stages configured"} />
              </div>
              <div className="border-t border-line pt-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Details</div>
                <ReviewRow label="Priority" value={priority} />
                <ReviewRow label="Due date" value={dueDate || "—"} />
                <ReviewRow label="Internal reference" value={internalReference || "—"} />
                <ReviewRow label="Assigned to" value={staff.find((m) => m.userId === assignedTo)?.name ?? "Unassigned"} />
              </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep(1)} className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={activate}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <CheckCircle2 size={14} /> {saving ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-paper border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">{children}</span>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}
