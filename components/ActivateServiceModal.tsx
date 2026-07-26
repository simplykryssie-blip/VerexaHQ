"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle2, FileText, ClipboardList, FileCheck2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ServiceTemplate, PipelineStage } from "@/lib/types";
import { friendlyDbError } from "@/lib/friendlyError";

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

// Sanitization (preview-vs-production, RLS detection, P0001 passthrough)
// now lives in lib/friendlyError.ts, shared with ClientModal and
// NewServiceModal — confirmed live that a documents_storage_bucket_check
// violation used to surface as literal SQL on this exact screen.
const ACTIVATION_FALLBACK = "We couldn't create this service workflow. No records were saved. Please try again or contact support.";

type TemplateTaskItem = {
  id: string;
  service_template_id: string;
  task_title: string;
  task_description: string | null;
  priority: string;
  due_offset_days: number | null;
  sort_order: number;
};
type TemplateDocItem = {
  id: string;
  service_template_id: string;
  document_name: string;
  document_category: string | null;
  is_required: boolean;
  sort_order: number;
};
type TemplateFormItem = {
  id: string;
  service_template_id: string;
  form_template_id: string;
  due_offset_days: number | null;
  sort_order: number;
  form_templates: { template_name: string } | null;
};
type RequestedServiceChip = { serviceType: string; label: string };

type Step = 1 | 2 | 3 | 4;
// "Customize" was removed as a selectable mode: the live RPC has no
// parameter for selective/edited activation, so offering it as a working
// choice would be dishonest. Only these two are actually functional.
type Method = "apply" | "create_only";

const STEP_LABELS: Record<Step, string> = {
  1: "Service setup",
  2: "Workflow",
  3: "Starting stage",
  4: "Review",
};

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
  // Called once, right before this component calls onClose() itself, with
  // the name of the service that was just activated — the parent uses
  // this to refresh its own data and show a success message. The modal
  // never shows its own "success" screen or stays open after activating;
  // see the note on fetchClientData in the client profile page for why
  // that used to silently reset this whole modal back to step 1.
  onActivated: (serviceName: string) => void;
}) {
  const [step, setStep] = useState<Step>(1);

  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  // Human-readable service-type labels, sourced from the same
  // client_setup_options rows ClientModal uses for its "Services needed"
  // checkboxes — never fabricated, falls back to a formatted version of
  // the raw code (e.g. "business_tax" -> "Business Tax") only when no
  // matching option exists (confirmed live: that's the case for
  // "business_tax" specifically).
  const [serviceTypeLabels, setServiceTypeLabels] = useState<Map<string, string>>(new Map());
  const [pipelines, setPipelines] = useState<{ id: string; pipeline_name: string }[]>([]);

  const [isRecurring, setIsRecurring] = useState(false);
  const [serviceYear, setServiceYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  // "Deadline date" replaces the old vague "Due date" label for one-time
  // services only — recurring services never require one overall target
  // deadline.
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineType, setDeadlineType] = useState("");
  const [billingFrequency, setBillingFrequency] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [members, setMembers] = useState<{ user_id: string; label: string }[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Pre-flight duplicate check against the real `services` table — a
  // frontend-only guard, not a substitute for a backend one (see the
  // written report accompanying this change on the safest RPC/constraint
  // design). Catches the two ways this actually happened in testing:
  // reopening "Add Service" for a service_type/year that already exists,
  // and re-clicking Activate before its disabled state visibly applied.
  // Recurring services are intentionally not checked yet — no safe rule
  // for those has been designed.
  const [existingDuplicate, setExistingDuplicate] = useState<{ service_year: string | null } | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const [method, setMethod] = useState<Method>("apply");
  const [previewOpen, setPreviewOpen] = useState(false);
  // Loaded once for every visible template (not just the selected one), so
  // the Step 1 picker can show real task/document/form counts per option
  // without N extra queries — the selected template's own items (for the
  // Preview) are just a client-side filter of the same arrays.
  const [allTasks, setAllTasks] = useState<TemplateTaskItem[]>([]);
  const [allDocs, setAllDocs] = useState<TemplateDocItem[]>([]);
  const [allForms, setAllForms] = useState<TemplateFormItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stageId, setStageId] = useState("");
  const defaultStageId = stages[0]?.id ?? "";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    supabase
      .from("client_setup_options")
      .select("option_code, option_label")
      .eq("option_group", "client_service_type")
      .then(({ data }) =>
        setServiceTypeLabels(new Map(((data as { option_code: string; option_label: string }[]) ?? []).map((o) => [o.option_code, o.option_label])))
      );
  }, []);

  useEffect(() => {
    supabase
      .from("pipelines")
      .select("id, pipeline_name")
      .eq("is_active", true)
      .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
      .then(({ data }) => setPipelines((data as { id: string; pipeline_name: string }[]) ?? []));
  }, [workspaceId]);

  // Picking a template resets the one-time/recurring default from its real
  // service_type — a heuristic, not a stored fact, so it's always editable.
  useEffect(() => {
    if (!selectedTemplate) return;
    setIsRecurring(RECURRING_SERVICE_TYPES.has(selectedTemplate.service_type));
  }, [selectedTemplate?.id]);

  useEffect(() => {
    setConfirmDuplicate(false);
    if (isRecurring || !selectedTemplate) {
      setExistingDuplicate(null);
      return;
    }
    let cancelled = false;
    let q = supabase.from("services").select("id, service_year").eq("client_id", clientId).eq("service_type", selectedTemplate.service_type);
    q = serviceYear ? q.eq("service_year", serviceYear) : q.is("service_year", null);
    q.limit(1).then(({ data }) => {
      if (cancelled) return;
      setExistingDuplicate((data as { id: string; service_year: string | null }[] | null)?.[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTemplate?.id, isRecurring, serviceYear, clientId]);

  useEffect(() => {
    if (templates.length === 0) {
      setAllTasks([]);
      setAllDocs([]);
      setAllForms([]);
      return;
    }
    const templateIds = templates.map((t) => t.id);
    setItemsLoading(true);
    Promise.all([
      supabase.from("service_template_tasks").select("*").in("service_template_id", templateIds).order("sort_order"),
      supabase.from("service_template_documents").select("*").in("service_template_id", templateIds).order("sort_order"),
      supabase
        .from("service_template_forms")
        .select("*, form_templates(template_name)")
        .in("service_template_id", templateIds)
        .order("sort_order"),
    ]).then(([t, d, f]) => {
      setAllTasks((t.data as TemplateTaskItem[]) ?? []);
      setAllDocs((d.data as TemplateDocItem[]) ?? []);
      setAllForms((f.data as unknown as TemplateFormItem[]) ?? []);
      setItemsLoading(false);
    });
  }, [templates]);

  // Real, workspace-configured stages for the template's default pipeline —
  // confirmed live that apply_service_template_to_client always
  // auto-selects the first one by sort_order with no way to override it,
  // which is why every Tax Preparation activation lands on that pipeline's
  // literal first stage, "Awaiting Documents" (that's real workspace data,
  // not hardcoded anywhere). Loading the real list here lets staff choose a
  // different (still real) starting stage instead.
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

  function humanizeServiceType(code: string): string {
    const known = serviceTypeLabels.get(code);
    if (known) return known;
    return code
      .split("_")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
  }
  function pipelineNameFor(pipelineId: string | null | undefined): string | null {
    if (!pipelineId) return null;
    return pipelines.find((p) => p.id === pipelineId)?.pipeline_name ?? null;
  }
  function countsFor(id: string) {
    return {
      tasks: allTasks.filter((t) => t.service_template_id === id).length,
      docs: allDocs.filter((d) => d.service_template_id === id).length,
      forms: allForms.filter((f) => f.service_template_id === id).length,
    };
  }
  const selectedTasks = allTasks.filter((t) => t.service_template_id === templateId);
  const selectedDocs = allDocs.filter((d) => d.service_template_id === templateId);
  const selectedForms = allForms.filter((f) => f.service_template_id === templateId);
  const selectedCounts = { tasks: selectedTasks.length, docs: selectedDocs.length, forms: selectedForms.length };

  function stageNeutralNote(s: PipelineStage, index: number, total: number, isDefault: boolean): string {
    if (isDefault) return "This stage will be assigned when the service is activated.";
    if (s.is_complete_stage) return "Marks this workflow as complete.";
    if (index === 0) return "First stage in this pipeline.";
    if (index === total - 1) return "Final stage in this pipeline.";
    return "Work continues here after the previous stage.";
  }

  function goToWorkflow() {
    if (!templateId) {
      setSetupError("Choose a workflow template.");
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
    if (existingDuplicate && !confirmDuplicate) {
      setSetupError("Confirm you want to create an additional service for this year, or change the year above.");
      return;
    }
    setSetupError(null);
    setStep(2);
  }

  function goToStage() {
    // Nothing to skip past for Create Service Only (no engagement/pipeline
    // involved), or when the template has no configured pipeline at all.
    if (method === "create_only" || stages.length === 0) {
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
  // selective inclusion. It also always auto-picks the first pipeline
  // stage by sort_order, so choosing a different real stage here requires
  // a narrow, single-row follow-up update after the RPC returns.
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
      setError(friendlyDbError(rpcError, "apply_service_template_to_client", ACTIVATION_FALLBACK));
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
    // Refresh + toast happen in the parent, then this modal closes itself
    // immediately — it never lingers on its own "success" screen, and it
    // never resets back to step 1, both of which only ever happened
    // before because the parent's old refresh path unmounted this whole
    // component out from under itself (see fetchClientData's comment).
    onActivated(selectedTemplate?.template_name ?? "Service");
    onClose();
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
  async function activateServiceOnly() {
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
      setError(friendlyDbError(insertError, "services_insert_create_only", ACTIVATION_FALLBACK));
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
    onActivated(selectedTemplate?.template_name ?? "Service");
    onClose();
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

        <div className="mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-muted sm:text-[11px]">
          {([1, 2, 3, 4] as Step[]).map((n, idx) => (
            <span key={n} className="flex items-center gap-1.5">
              <span className={step >= n ? "text-[#108A64]" : ""}>
                {n}. {STEP_LABELS[n]}
              </span>
              {idx < 3 && <ChevronRight size={11} />}
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            {requestedServiceLabel && (
              <div className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink">
                Activating for requested service: <strong>{requestedServiceLabel}</strong>
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

            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Workflow template</div>
            <p className="text-xs text-muted">
              The requested service is already known — this is the workflow used to deliver it.
            </p>

            {templatesError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Couldn't load service templates: {templatesError}
              </div>
            )}
            {!templatesError && templates.length === 0 && (
              <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
                No workflow templates are set up for this workspace yet.
              </div>
            )}
            <div className="space-y-2">
              {templates.map((t) => {
                const counts = countsFor(t.id);
                const pipelineName = pipelineNameFor(t.default_pipeline_id);
                return (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                      templateId === t.id ? "border-[#108A64] bg-emerald-50/40" : "border-line"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-ink">{t.template_name}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            t.is_platform_template ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {t.is_platform_template ? "Platform template" : "Firm template"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {humanizeServiceType(t.service_type)}
                        {pipelineName ? ` · ${pipelineName}` : " · No pipeline configured"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {itemsLoading ? "Loading counts…" : `${counts.tasks} task(s) · ${counts.docs} document request(s) · ${counts.forms} form(s)`}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="template"
                      checked={templateId === t.id}
                      onChange={() => setTemplateId(t.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#108A64]"
                    />
                  </label>
                );
              })}
            </div>

            <button
              type="button"
              disabled
              title="Workflow template builder coming soon."
              className="w-full cursor-not-allowed rounded-xl border border-dashed border-line px-4 py-2.5 text-left text-xs font-semibold text-muted"
            >
              Create a firm workflow template
              <span className="ml-1.5 font-normal italic">— Workflow template builder coming soon.</span>
            </button>

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
                    {existingDuplicate && (
                      <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                        <p className="font-semibold">
                          This client already has {humanizeServiceType(selectedTemplate?.service_type ?? "")}
                          {serviceYear ? ` for ${serviceYear}` : ""}.
                        </p>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={confirmDuplicate}
                            onChange={(e) => setConfirmDuplicate(e.target.checked)}
                            className="mt-0.5 h-3.5 w-3.5 accent-amber-700"
                          />
                          I understand this creates an additional service for this year and want to proceed anyway.
                        </label>
                      </div>
                    )}
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
                onClick={goToWorkflow}
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
                active={method === "apply"}
                onClick={() => setMethod("apply")}
                title="Apply selected workflow"
                description="Use the chosen workflow template exactly as configured. Recommended for most services."
              />
              <div className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm opacity-70">
                <input type="radio" disabled className="mt-0.5 h-4 w-4" readOnly />
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">Customize workflow</span>
                    <span className="rounded-full bg-paper border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                      Coming after workflow builder setup
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">Duplicate or edit a firm workflow template before using it for a client.</div>
                </div>
              </div>
              <MethodCard
                active={method === "create_only"}
                onClick={() => setMethod("create_only")}
                title="Create service only"
                description="Creates the active service record without a workflow workspace, tasks, forms, or document requests."
              />
            </div>

            {method === "apply" && selectedTemplate && (
              <div className="space-y-2 rounded-xl border border-line bg-paper p-4 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-ink">{selectedTemplate.template_name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      selectedTemplate.is_platform_template ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {selectedTemplate.is_platform_template ? "Platform template" : "Firm template"}
                  </span>
                </div>
                <div className="space-y-1">
                  <ReviewRow label="Service type" value={humanizeServiceType(selectedTemplate.service_type)} />
                  <ReviewRow label="Pipeline" value={pipelineNameFor(selectedTemplate.default_pipeline_id) ?? "No pipeline configured"} />
                  <ReviewRow label="Starting stage" value={stages[0]?.stage_name ?? "No stages configured"} />
                  <ReviewRow
                    label="Will create"
                    value={itemsLoading ? "Loading…" : `${selectedCounts.tasks} task(s) · ${selectedCounts.docs} document request(s) · ${selectedCounts.forms} form(s)`}
                  />
                </div>
                <p className="pt-1 text-xs font-semibold text-ink">Quick Activate will apply this workflow exactly as configured.</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  <button type="button" onClick={() => setStep(1)} className="text-xs font-semibold text-[#108A64] hover:underline">
                    Choose a different template
                  </button>
                  <button type="button" onClick={() => setPreviewOpen((v) => !v)} className="text-xs font-semibold text-[#108A64] hover:underline">
                    {previewOpen ? "Hide preview" : "Preview workflow"}
                  </button>
                </div>
              </div>
            )}

            {method === "apply" && previewOpen && (
              <div className="space-y-2">
                {itemsLoading && <div className="text-xs text-muted">Loading template items…</div>}
                {!itemsLoading && (
                  <div className="divide-y divide-line rounded-xl border border-line">
                    {selectedTasks.map((t) => (
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
                    {selectedDocs.map((d) => (
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
                    {selectedForms.map((f) => (
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
                    {selectedTasks.length + selectedDocs.length + selectedForms.length === 0 && (
                      <div className="p-3 text-xs text-muted">This template has no tasks, documents, or forms configured.</div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted">Per-item include/exclude isn't available yet — that needs a new, separately approved RPC.</p>
              </div>
            )}

            {method === "create_only" && (
              <div className="space-y-1.5 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <p className="font-semibold">A Service Workspace will not be created.</p>
                <p>
                  No existing approved backend path creates an engagement/Service Workspace without also creating a
                  template's full task/document/form set — only apply_service_template_to_client creates an
                  engagement, and it can't skip those. This creates a bare service record only, the same as the
                  manual "New Service" form. A new RPC would be needed to support "service + empty workspace"
                  safely — treat this as an advanced option.
                </p>
              </div>
            )}

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={goToStage} className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-ink">{pipelineNameFor(selectedTemplate?.default_pipeline_id) ?? "Pipeline"}</div>
              <p className="mt-1 text-xs text-muted">
                Real, workspace-configured stages for this workflow's pipeline. Choosing one here only sets where
                the new engagement starts — it doesn't run any automation.
              </p>
            </div>
            <div className="space-y-2">
              {stages.map((s, idx) => {
                const isDefault = s.id === defaultStageId;
                const note = s.stage_description || stageNeutralNote(s, idx, stages.length, isDefault);
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                      stageId === s.id ? "border-[#108A64] bg-emerald-50/40" : "border-line"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-ink">{s.stage_name}</span>
                        <span className="text-[10px] font-semibold text-muted">
                          Stage {idx + 1} of {stages.length}
                        </span>
                        {isDefault && (
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#108A64]">Template default</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">{note}</div>
                    </div>
                    <input type="radio" name="stage" checked={stageId === s.id} onChange={() => setStageId(s.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#108A64]" />
                  </label>
                );
              })}
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
            <div className="space-y-3 rounded-xl border border-line bg-paper p-4 text-sm">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Service</div>
                <div className="space-y-1">
                  {requestedServiceLabel && <ReviewRow label="Requested service" value={requestedServiceLabel} />}
                  <ReviewRow label="Template" value={selectedTemplate?.template_name ?? "—"} />
                  <ReviewRow label="Service type" value={selectedTemplate ? humanizeServiceType(selectedTemplate.service_type) : "—"} />
                </div>
              </div>

              {method === "apply" && (
                <div className="border-t border-line pt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Workflow</div>
                  <div className="space-y-1">
                    <ReviewRow label="Pipeline" value={pipelineNameFor(selectedTemplate?.default_pipeline_id) ?? "No pipeline configured"} />
                    <ReviewRow label="Starting stage" value={stages.find((s) => s.id === stageId)?.stage_name ?? "—"} />
                    <ReviewRow label="Template owner" value={selectedTemplate?.is_platform_template ? "Platform" : "Firm"} />
                    <ReviewRow label="Tasks" value={String(selectedCounts.tasks)} />
                    <ReviewRow label="Document requests" value={String(selectedCounts.docs)} />
                    <ReviewRow label="Forms" value={String(selectedCounts.forms)} />
                  </div>
                </div>
              )}

              <div className="border-t border-line pt-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Dates</div>
                <div className="space-y-1">
                  <ReviewRow label="Start date" value={startDate || "—"} />
                  {serviceYear && <ReviewRow label="Service year / period" value={serviceYear} />}
                  {!isRecurring && deadlineDate && <ReviewRow label={`Deadline (${deadlineType || "type not set"})`} value={deadlineDate} />}
                  {isRecurring && <ReviewRow label="Frequency" value={billingFrequency || "Unspecified"} />}
                </div>
              </div>

              <div className="border-t border-line pt-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Activation result</div>
                <p className="text-sm font-semibold text-ink">
                  {method === "apply" ? "Full workflow will be created." : "Service record only; no workspace will be created."}
                </p>
              </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                onClick={() => (method === "create_only" || stages.length === 0 ? setStep(2) : setStep(3))}
                className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button type="button" onClick={() => setStep(1)} className="text-xs font-semibold text-[#108A64] hover:underline">
                Change workflow template
              </button>
              <button
                onClick={method === "apply" ? activate : activateServiceOnly}
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
