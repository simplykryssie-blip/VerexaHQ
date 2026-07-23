"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, CheckCircle2, FileText, ClipboardList, FileCheck2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ServiceTemplate, PipelineStage } from "@/lib/types";

// Heuristic default only — service_templates has no is_recurring/frequency
// column of its own, so this just pre-selects a sensible starting choice on
// the existing, real `services.is_recurring` toggle. Staff can always
// override it; nothing here is persisted as a new fact about the template.
const RECURRING_SERVICE_TYPES = new Set(["bookkeeping", "payroll"]);

// deadlines.deadline_type is a real, unconstrained text column — these are
// just a curated set of values, not an enum enforced anywhere.
const DEADLINE_TYPE_OPTIONS = [
  "Filing deadline",
  "Extension deadline",
  "Internal completion target",
  "Client-promised completion date",
  "Document cutoff",
  "Custom deadline",
];

// services.billing_frequency is real but has no CHECK constraint — these
// are just sensible common choices for a free-text column.
const BILLING_FREQUENCY_OPTIONS = ["Monthly", "Quarterly", "Semi-Annually", "Annually"];

type TemplateTaskItem = {
  id: string;
  task_title: string;
  task_description: string | null;
  priority: string;
  due_offset_days: number | null;
  sort_order: number;
};
type TemplateDocItem = {
  id: string;
  document_name: string;
  document_category: string | null;
  is_required: boolean;
  sort_order: number;
};
type TemplateFormItem = {
  id: string;
  form_template_id: string;
  due_offset_days: number | null;
  sort_order: number;
  form_templates: { template_name: string } | null;
};
type RequestedServiceChip = { serviceType: string; label: string };

type Step = 1 | 2 | 3 | 4 | 5;
type Method = "quick" | "customize" | "blank";

export default function ActivateServiceModal({
  clientId,
  workspaceId,
  initialServiceType,
  requestedServiceLabel,
  remainingRequestedServices,
  onClose,
  onActivated,
}: {
  clientId: string;
  workspaceId: string;
  // Set when this modal was opened from a specific Requested Service row.
  // If a service_templates row shares this service_type, it's preselected
  // (never auto-submitted — the user still confirms).
  initialServiceType?: string;
  requestedServiceLabel?: string;
  // Other still-unactivated requested services for this client, so staff
  // can jump straight to the next one after activating without leaving
  // the modal. Purely a UI convenience — parent state (via onActivated)
  // is what actually keeps this list current.
  remainingRequestedServices?: RequestedServiceChip[];
  onClose: () => void;
  onActivated: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  // Starts from the prop, but "Activate another service" clears it —
  // otherwise the banner would keep pointing at whichever request opened
  // the modal even after staff has moved on to a different one.
  const [sessionRequestedLabel, setSessionRequestedLabel] = useState(requestedServiceLabel);

  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const [isRecurring, setIsRecurring] = useState(false);
  const [serviceYear, setServiceYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  // "Deadline date" replaces the old vague "Due date" label for one-time
  // services only — recurring services never require one overall target
  // deadline (see REQUIRED FIX in the originating request).
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineType, setDeadlineType] = useState("");
  const [billingFrequency, setBillingFrequency] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [members, setMembers] = useState<{ user_id: string; label: string }[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [method, setMethod] = useState<Method>("quick");
  const [templateTasks, setTemplateTasks] = useState<TemplateTaskItem[]>([]);
  const [templateDocs, setTemplateDocs] = useState<TemplateDocItem[]>([]);
  const [templateForms, setTemplateForms] = useState<TemplateFormItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stageId, setStageId] = useState("");
  const defaultStageId = stages[0]?.id ?? "";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ serviceId: string; engagementId: string | null } | null>(null);

  // Only templates apply_service_template_to_client can actually activate:
  // workspace-owned templates, or global templates that are explicitly
  // marked as platform templates (workspace_id is null alone isn't enough —
  // the RPC also requires is_platform_template = true).
  useEffect(() => {
    supabase
      .from("service_templates")
      .select("*")
      .eq("is_active", true)
      .or(`workspace_id.eq.${workspaceId},and(workspace_id.is.null,is_platform_template.eq.true)`)
      .order("template_name")
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setTemplatesError(queryError.message);
          setTemplates([]);
          return;
        }
        setTemplatesError(null);
        const list = (data as ServiceTemplate[]) ?? [];
        setTemplates(list);
        if (initialServiceType) {
          const match = list.find((t) => t.service_type === initialServiceType);
          if (match) setTemplateId(match.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    supabase
      .from("workspace_members")
      .select("user_id, display_name, role")
      .eq("workspace_id", workspaceId)
      .eq("member_status", "Active")
      .then(({ data }) =>
        setMembers(((data as any[]) ?? []).map((m) => ({ user_id: m.user_id, label: m.display_name || m.role || "Team member" })))
      );
  }, [workspaceId]);

  // Picking a template resets the one-time/recurring default from its real
  // service_type — a heuristic, not a stored fact, so it's always editable.
  useEffect(() => {
    if (!selectedTemplate) return;
    setIsRecurring(RECURRING_SERVICE_TYPES.has(selectedTemplate.service_type));
  }, [selectedTemplate?.id]);

  // Loaded once per template regardless of activation method — Quick uses
  // just the counts, Customize shows the full list, so one fetch covers
  // both instead of two separate queries like the old count-only version.
  useEffect(() => {
    if (!templateId) {
      setTemplateTasks([]);
      setTemplateDocs([]);
      setTemplateForms([]);
      return;
    }
    setItemsLoading(true);
    Promise.all([
      supabase.from("service_template_tasks").select("*").eq("service_template_id", templateId).order("sort_order"),
      supabase.from("service_template_documents").select("*").eq("service_template_id", templateId).order("sort_order"),
      supabase
        .from("service_template_forms")
        .select("*, form_templates(template_name)")
        .eq("service_template_id", templateId)
        .order("sort_order"),
    ]).then(([t, d, f]) => {
      setTemplateTasks((t.data as TemplateTaskItem[]) ?? []);
      setTemplateDocs((d.data as TemplateDocItem[]) ?? []);
      setTemplateForms((f.data as unknown as TemplateFormItem[]) ?? []);
      setItemsLoading(false);
    });
  }, [templateId]);

  // Real, workspace-configured stages for the template's default pipeline —
  // confirmed live that apply_service_template_to_client always
  // auto-selects the first one by sort_order with no way to override it,
  // which is why every Tax Preparation activation lands on that pipeline's
  // literal first stage, "Awaiting Documents". Loading the real list here
  // lets staff choose a different (still real) starting stage instead.
  useEffect(() => {
    if (!selectedTemplate?.default_pipeline_id) {
      setStages([]);
      setStageId("");
      return;
    }
    supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", selectedTemplate.default_pipeline_id)
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        const list = (data as PipelineStage[]) ?? [];
        setStages(list);
        setStageId(list[0]?.id ?? "");
      });
  }, [selectedTemplate?.default_pipeline_id]);

  function resetForAnother() {
    setStep(1);
    setTemplateId("");
    setIsRecurring(false);
    setServiceYear(new Date().getFullYear().toString());
    setStartDate(new Date().toISOString().slice(0, 10));
    setDeadlineDate("");
    setDeadlineType("");
    setBillingFrequency("");
    setAssignedTo("");
    setMethod("quick");
    setStageId("");
    setSetupError(null);
    setError(null);
    setSuccessInfo(null);
    setSessionRequestedLabel(undefined);
  }

  function goToMethod() {
    if (!templateId) {
      setSetupError("Choose a service.");
      return;
    }
    if (!startDate) {
      setSetupError("Start date is required.");
      return;
    }
    if (serviceYear && !/^\d{4}$/.test(serviceYear)) {
      setSetupError("Service year must be a 4-digit year (e.g. 2026), or left blank.");
      return;
    }
    if (!isRecurring) {
      if (deadlineDate && deadlineDate < startDate) {
        setSetupError("Deadline date can't be earlier than the start date.");
        return;
      }
      if (deadlineDate && !deadlineType) {
        setSetupError("Choose a deadline type, or clear the deadline date.");
        return;
      }
    }
    setSetupError(null);
    setStep(2);
  }

  function goToStage() {
    // Nothing to skip past for Start blank (no engagement/pipeline), or
    // when the template has no configured pipeline to choose a stage from.
    if (method === "blank" || stages.length === 0) {
      setStep(4);
      return;
    }
    setStep(3);
  }

  // apply_service_template_to_client's live signature (verified via
  // pg_get_functiondef) is (p_client_id, p_service_template_id,
  // p_start_date, p_due_date, p_assigned_to, p_price, p_service_year,
  // p_billing_frequency, p_is_recurring). It always creates every template
  // task/document/form unconditionally — there is no parameter for
  // selective inclusion, so "Customize" activates the same full set as
  // "Quick" (the difference is only that staff reviewed it item-by-item
  // first). It also always auto-picks the first pipeline stage by
  // sort_order, so choosing a different real stage here requires a
  // narrow, single-row follow-up update after the RPC returns.
  async function activate() {
    setSaving(true);
    setError(null);
    const { data: serviceId, error: rpcError } = await supabase.rpc("apply_service_template_to_client", {
      p_client_id: clientId,
      p_service_template_id: templateId,
      p_start_date: startDate,
      p_due_date: !isRecurring && deadlineDate ? deadlineDate : null,
      p_assigned_to: assignedTo || null,
      p_service_year: serviceYear || null,
      p_billing_frequency: isRecurring ? billingFrequency || null : null,
      p_is_recurring: isRecurring,
    });
    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    const { data: engagement } = await supabase
      .from("engagements")
      .select("id")
      .eq("service_id", serviceId as string)
      .maybeSingle();
    const engagementId = (engagement?.id as string | undefined) ?? null;

    // Both of these are narrow, single-row updates scoped to the exact
    // record(s) the RPC just created/returned — not a bypass of the RPC's
    // own transaction, and not a new write pattern: NewServiceModal
    // already writes pipeline_stage_id directly, and NewDeadlineModal
    // already inserts into `deadlines` directly, both outside any RPC.
    if (stageId && stageId !== defaultStageId) {
      await supabase.from("services").update({ pipeline_stage_id: stageId }).eq("id", serviceId as string);
      if (engagementId) {
        await supabase.from("engagements").update({ pipeline_stage_id: stageId }).eq("id", engagementId);
      }
    }

    if (!isRecurring && deadlineDate && deadlineType) {
      await supabase.from("deadlines").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        service_id: serviceId,
        engagement_id: engagementId,
        deadline_title: `${selectedTemplate?.template_name ?? "Service"} — ${deadlineType}`,
        deadline_type: deadlineType,
        due_date: deadlineDate,
        deadline_status: "Upcoming",
        assigned_to: assignedTo || null,
      });
    }

    setSaving(false);
    onActivated();
    setSuccessInfo({ serviceId: serviceId as string, engagementId });
    setStep(5);
  }

  // No existing RPC creates a service + engagement without also creating
  // every template task/document/form — apply_service_template_to_client
  // is the only path that creates an engagement at all, and it can't skip
  // the workflow items. A raw client-side insert into `engagements` would
  // bypass that RPC's can_staff_write() permission check, its workspace
  // validation, and its transactional atomicity, so this mode is
  // deliberately limited to a plain `services` row only (the same direct
  // insert NewServiceModal already performs) until a new, approved RPC
  // exists for "service + engagement, no workflow items."
  async function activateBlank() {
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("services")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        service_type: selectedTemplate?.service_type ?? "",
        service_name: selectedTemplate?.template_name ?? null,
        service_status: "New",
        service_year: serviceYear || null,
        start_date: startDate || null,
        due_date: !isRecurring && deadlineDate ? deadlineDate : null,
        assigned_to: assignedTo || null,
        billing_frequency: isRecurring ? billingFrequency || null : null,
        is_recurring: isRecurring,
      })
      .select("id")
      .single();
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    if (!isRecurring && deadlineDate && deadlineType) {
      await supabase.from("deadlines").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        service_id: data.id,
        deadline_title: `${selectedTemplate?.template_name ?? "Service"} — ${deadlineType}`,
        deadline_type: deadlineType,
        due_date: deadlineDate,
        deadline_status: "Upcoming",
        assigned_to: assignedTo || null,
      });
    }

    setSaving(false);
    onActivated();
    setSuccessInfo({ serviceId: data.id as string, engagementId: null });
    setStep(5);
  }

  function offsetLabel(offsetDays: number | null) {
    if (offsetDays === null || offsetDays === undefined) return "No due date";
    if (offsetDays === 0) return "Start date";
    return `Start date ${offsetDays > 0 ? "+" : ""}${offsetDays}d`;
  }
  function computedDate(offsetDays: number | null) {
    if (offsetDays === null || offsetDays === undefined || !startDate) return null;
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
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

        {step < 5 && (
          <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span className={step >= 1 ? "text-[#108A64]" : ""}>1. Setup</span>
            <ChevronRight size={12} />
            <span className={step >= 2 ? "text-[#108A64]" : ""}>2. Method</span>
            <ChevronRight size={12} />
            <span className={step >= 3 ? "text-[#108A64]" : ""}>3. Stage</span>
            <ChevronRight size={12} />
            <span className={step >= 4 ? "text-[#108A64]" : ""}>4. Review</span>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {sessionRequestedLabel && (
              <div className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink">
                Activating for requested service: <strong>{sessionRequestedLabel}</strong>
              </div>
            )}
            {remainingRequestedServices && remainingRequestedServices.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Still requested for this client
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {remainingRequestedServices.map((r) => {
                    const match = templates.find((t) => t.service_type === r.serviceType);
                    const active = !!match && templateId === match.id;
                    return (
                      <button
                        key={r.serviceType}
                        type="button"
                        disabled={!match}
                        onClick={() => match && setTemplateId(match.id)}
                        title={!match ? "No service template configured for this service type yet" : undefined}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          active ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"
                        } ${!match ? "cursor-not-allowed opacity-50" : "hover:bg-paper"}`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {templatesError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Couldn't load service templates: {templatesError}
              </div>
            )}
            {!templatesError && templates.length === 0 && (
              <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
                No service templates are set up for this workspace yet.
              </div>
            )}
            <div className="space-y-2">
              {templates.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    templateId === t.id ? "border-[#108A64] bg-emerald-50/40" : "border-line"
                  }`}
                >
                  <div>
                    <div className="font-semibold text-ink">{t.template_name}</div>
                    <div className="text-xs text-muted">{t.service_type}</div>
                  </div>
                  <input
                    type="radio"
                    name="template"
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                    className="h-4 w-4 accent-[#108A64]"
                  />
                </label>
              ))}
            </div>

            {templateId && (
              <div className="space-y-3 border-t border-line pt-3">
                <div className="inline-flex gap-1 rounded-xl bg-paper p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setIsRecurring(false)}
                    className={`rounded-lg px-3 py-1.5 transition-colors ${!isRecurring ? "bg-[#108A64] text-white" : "text-muted hover:text-ink"}`}
                  >
                    One-time / project
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRecurring(true)}
                    className={`rounded-lg px-3 py-1.5 transition-colors ${isRecurring ? "bg-[#108A64] text-white" : "text-muted hover:text-ink"}`}
                  >
                    Recurring
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start date">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
                  </Field>
                  <Field label={isRecurring ? "Service year (optional)" : "Service year / period (optional)"}>
                    <input
                      placeholder="e.g. 2026"
                      inputMode="numeric"
                      value={serviceYear}
                      onChange={(e) => setServiceYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                    />
                  </Field>
                </div>

                {!isRecurring ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Deadline date (optional)">
                        <input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
                      </Field>
                      <Field label={deadlineDate ? "Deadline type (required)" : "Deadline type"}>
                        <select
                          value={deadlineType}
                          onChange={(e) => setDeadlineType(e.target.value)}
                          disabled={!deadlineDate}
                          className="w-full rounded-lg border border-line px-2.5 py-2 text-sm disabled:bg-paper disabled:text-muted"
                        >
                          <option value="">Choose…</option>
                          {DEADLINE_TYPE_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <p className="text-xs text-muted">
                      The overall filing, statutory, client-promised, or internal completion deadline for this
                      service. This is not the due date for every task.
                    </p>
                  </>
                ) : (
                  <>
                    <Field label="Billing / work frequency (optional)">
                      <select
                        value={billingFrequency}
                        onChange={(e) => setBillingFrequency(e.target.value)}
                        className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                      >
                        <option value="">Unspecified</option>
                        {BILLING_FREQUENCY_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p className="text-xs text-muted">
                      Recurring services don't need one overall deadline — this is ongoing work. Generating each
                      period's own due dates automatically is a separate, later build; for now this only records
                      the service's start date and frequency.
                    </p>
                  </>
                )}

                {members.length > 0 && (
                  <Field label="Assigned team member (optional)">
                    <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm">
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.label}
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
              <button
                disabled={!templateId}
                onClick={goToMethod}
                className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="space-y-2">
              <MethodCard
                active={method === "quick"}
                onClick={() => setMethod("quick")}
                title="Quick activate"
                description="Use this template exactly as configured. Fastest option, recommended for most services."
              />
              <MethodCard
                active={method === "customize"}
                onClick={() => setMethod("customize")}
                title="Customize before activating"
                description="Review every task, document request, and form this template creates before confirming."
              />
              <MethodCard
                active={method === "blank"}
                onClick={() => setMethod("blank")}
                title="Start blank"
                description="Create just the service record — no tasks, documents, or forms. No Service Workspace yet either (see note below)."
              />
            </div>

            {method === "quick" && (
              <div className="rounded-xl border border-line bg-paper p-4 text-sm">
                <div className="font-semibold text-ink">{selectedTemplate?.template_name}</div>
                <div className="mt-1 text-xs text-muted">
                  {itemsLoading
                    ? "Loading…"
                    : `${templateTasks.length} task(s) · ${templateDocs.length} document request(s) · ${templateForms.length} form(s) will be created automatically.`}
                </div>
              </div>
            )}

            {method === "customize" && (
              <div className="space-y-2">
                <p className="rounded-lg border border-dashed border-line bg-paper px-3 py-2 text-xs text-muted">
                  Per-item include/exclude isn't available yet — that needs a new, separately approved RPC (the
                  current activation function always creates every item below as a set). This review lets you see
                  exactly what will be created and confirm the dates above before activating.
                </p>
                {itemsLoading && <div className="text-xs text-muted">Loading template items…</div>}
                {!itemsLoading && (
                  <div className="divide-y divide-line rounded-xl border border-line">
                    {templateTasks.map((t) => (
                      <ItemRow
                        key={`task-${t.id}`}
                        icon={ClipboardList}
                        typeLabel="Task"
                        audienceLabel="Internal"
                        title={t.task_title}
                        responsible={assignedTo ? members.find((m) => m.user_id === assignedTo)?.label ?? "Assigned member" : "Unassigned"}
                        dateLabel={computedDate(t.due_offset_days)}
                        basisLabel={offsetLabel(t.due_offset_days)}
                      />
                    ))}
                    {templateDocs.map((d) => (
                      <ItemRow
                        key={`doc-${d.id}`}
                        icon={FileText}
                        typeLabel="Document request"
                        audienceLabel="Client-facing"
                        title={d.document_name}
                        responsible="Requested by activating staff member"
                        dateLabel={null}
                        basisLabel="No due date — this template item type has no date rule"
                      />
                    ))}
                    {templateForms.map((f) => (
                      <ItemRow
                        key={`form-${f.id}`}
                        icon={FileCheck2}
                        typeLabel="Form"
                        audienceLabel="Client-facing"
                        title={f.form_templates?.template_name ?? "Form"}
                        responsible="Assigned by activating staff member"
                        dateLabel={computedDate(f.due_offset_days)}
                        basisLabel={offsetLabel(f.due_offset_days)}
                      />
                    ))}
                    {templateTasks.length + templateDocs.length + templateForms.length === 0 && (
                      <div className="p-3 text-xs text-muted">This template has no tasks, documents, or forms configured.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {method === "blank" && (
              <div className="rounded-lg border border-dashed border-line bg-paper px-3 py-2 text-xs text-muted">
                No existing approved backend path creates an engagement/Service Workspace without also creating a
                template's full task/document/form set — only apply_service_template_to_client creates an
                engagement, and it can't skip those. This mode creates a bare services row only, matching what the
                manual "New Service" form already does. A new RPC would be needed to also create an empty
                Service Workspace here safely.
              </div>
            )}

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                <ChevronLeft size={14} /> Back
              </button>
              {method === "blank" ? (
                <button
                  onClick={activateBlank}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <CheckCircle2 size={14} /> {saving ? "Creating…" : "Create service"}
                </button>
              ) : (
                <button onClick={goToStage} className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
                  Next
                </button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              These are the real, workspace-configured stages for this template's pipeline. Every activation used
              to always land on the first one automatically — pick a different one if that's not accurate here.
            </p>
            <div className="space-y-2">
              {stages.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    stageId === s.id ? "border-[#108A64] bg-emerald-50/40" : "border-line"
                  }`}
                >
                  <span className="font-semibold text-ink">{s.stage_name}</span>
                  <input type="radio" name="stage" checked={stageId === s.id} onChange={() => setStageId(s.id)} className="h-4 w-4 accent-[#108A64]" />
                </label>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={() => setStep(4)} className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-line bg-paper p-4 text-sm">
              <ReviewRow label="Service" value={selectedTemplate?.template_name ?? "—"} />
              <ReviewRow label="Type" value={isRecurring ? "Recurring" : "One-time / project"} />
              {serviceYear && <ReviewRow label="Service year / period" value={serviceYear} />}
              <ReviewRow label="Start date" value={startDate || "—"} />
              {!isRecurring && deadlineDate && <ReviewRow label={`Deadline (${deadlineType || "type not set"})`} value={deadlineDate} />}
              {isRecurring && <ReviewRow label="Frequency" value={billingFrequency || "Unspecified"} />}
              <ReviewRow label="Assigned to" value={members.find((m) => m.user_id === assignedTo)?.label ?? "Unassigned"} />
              <ReviewRow
                label="Activation method"
                value={method === "quick" ? "Quick activate" : method === "customize" ? "Customize (reviewed)" : "Start blank"}
              />
              {method !== "blank" && stageId && <ReviewRow label="Starting stage" value={stages.find((s) => s.id === stageId)?.stage_name ?? "—"} />}
              {method !== "blank" && (
                <ReviewRow
                  label="Will create"
                  value={`${templateTasks.length} internal task(s) · ${templateDocs.length} client document request(s) · ${templateForms.length} client form(s)`}
                />
              )}
              {method === "blank" && <ReviewRow label="Will create" value="Service record only — no tasks, documents, or forms" />}
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

            <div className="flex justify-between pt-2">
              <button
                onClick={() => (method === "blank" || stages.length === 0 ? setStep(2) : setStep(3))}
                className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={activate}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <CheckCircle2 size={14} /> {saving ? "Activating…" : "Activate service"}
              </button>
            </div>
          </div>
        )}

        {step === 5 && successInfo && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[#108A64]">
              <CheckCircle2 size={16} /> Service activated successfully.
            </div>
            <div className="space-y-2">
              <button
                onClick={resetForAnother}
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper"
              >
                Activate another service
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper"
              >
                Return to client
              </button>
              {successInfo.engagementId && (
                <button
                  onClick={() => {
                    const id = successInfo.engagementId!;
                    onClose();
                    router.push(`/work/${id}`);
                  }}
                  className="w-full rounded-xl bg-[#108A64] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7555]"
                >
                  Open Service Workspace
                </button>
              )}
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

function MethodCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
        active ? "border-[#108A64] bg-emerald-50/40" : "border-line"
      }`}
      onClick={onClick}
    >
      <input type="radio" checked={active} onChange={onClick} className="mt-0.5 h-4 w-4 accent-[#108A64]" readOnly />
      <div>
        <div className="font-semibold text-ink">{title}</div>
        <div className="mt-0.5 text-xs text-muted">{description}</div>
      </div>
    </label>
  );
}

function ItemRow({
  icon: Icon,
  typeLabel,
  audienceLabel,
  title,
  responsible,
  dateLabel,
  basisLabel,
}: {
  icon: any;
  typeLabel: string;
  audienceLabel: string;
  title: string;
  responsible: string;
  dateLabel: string | null;
  basisLabel: string;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
      <Icon size={14} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-ink">{title}</span>
          <span className="rounded-full bg-paper border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">{typeLabel}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              audienceLabel === "Internal" ? "bg-paper border border-line text-muted" : "bg-sky-50 text-sky-700"
            }`}
          >
            {audienceLabel}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted">{responsible}</div>
      </div>
      <div className="shrink-0 text-right text-xs">
        <div className="font-mono text-ink">{dateLabel ?? "No due date"}</div>
        <div className="text-muted">{basisLabel}</div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}
