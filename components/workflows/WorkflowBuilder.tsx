"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  Trash2,
  CheckSquare,
  BookOpen,
  Workflow,
  FileSignature,
  FolderInput,
  ArrowRightCircle,
  UserCog,
  Bell,
  UserX,
  UserCheck,
  Pencil,
  UserPlus,
  Route,
  DollarSign,
  Send,
  Tag,
  StickyNote,
  MessageCircle,
  PlayCircle,
  StopCircle,
  LogIn,
  Clock,
  Plus,
  ExternalLink,
  Webhook,
  X,
  CalendarPlus,
  BellOff,
  BellRing,
  Milestone,
  History,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { TriggerFields, triggerSummary, type TemplateOption, type PipelineOption } from "@/components/workflows/TriggerFields";
import {
  ConditionsEditor,
  ConditionGroupsEditor,
  normalizeToConditionGroups,
  conditionGroupsAreEmpty,
  type Condition,
  type ConditionGroup,
} from "@/components/workflows/ConditionsEditor";
import { TemplateEditRow } from "@/components/settings/TemplateEditRow";
import { CreateTemplateForm } from "@/components/settings/CreateTemplateForm";
import { CreateQuickTemplate } from "@/components/workflows/CreateQuickTemplate";
import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { RunDetailPanel } from "@/components/workflows/RunDetailPanel";
import { InlineStepPickerField } from "@/components/workflows/StepPicker";
import { TagNameInput } from "@/components/workflows/TagNameInput";
import { ensureTagConfirmed, collectClientTagValues } from "@/lib/ensureTag";
import { MergeFieldPicker } from "@/components/settings/MergeFieldPicker";
import { AUTOMATION_MERGE_FIELD_GROUPS } from "@/lib/automationMergeFields";
import { insertAtFieldCursor } from "@/lib/insertAtFieldCursor";

export type StaffOption = { id: string; display_name: string | null; is_owner?: boolean };
export type AutomationOption = { id: string; name: string };

export type WorkflowStepRow = {
  id: string;
  display_order: number;
  action_type: string;
  action_config: Record<string, unknown>;
  delay_minutes: number;
  canvas_x: number | null;
  canvas_y: number | null;
  requires_approval: boolean;
  approver_role_id: string | null;
  display_name: string | null;
  is_enabled: boolean;
};

export type RoleOption = { id: string; name: string };

export type PendingApprovalRow = {
  id: string;
  created_at: string;
  step_display_name: string | null;
  action_type: string;
  engagement_number: string | null;
  client_name: string | null;
};

export type WorkflowStepEdgeRow = {
  id: string;
  from_step_id: string;
  to_step_id: string | null;
  // Legacy flat Condition[] (every edge saved before condition groups
  // existed) or the current ConditionGroup[] -- normalizeToConditionGroups
  // is the only thing that needs to know which.
  branch_conditions: Condition[] | ConditionGroup[] | null;
  label: string | null;
  sort_order: number;
};

export type WorkflowRunRow = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  current_step_id: string | null;
  engagement_number: string | null;
  client_name: string | null;
};

type WorkflowLogRow = {
  id: string;
  status: string;
  executed_at: string | null;
  execution_data: unknown;
  error_message: string | null;
};

export type MessageTemplateOption = { id: string; name: string; slug: string };

// category/description/keywords are display-only metadata for the
// searchable/categorized action picker (components/workflows/StepPicker.tsx)
// -- they never touch execution. The engine only ever sees `value` (stored
// verbatim as automation_steps.action_type); category groupings here can be
// freely renamed/reshuffled without any migration.
export const ACTION_CATEGORIES: { key: string; label: string }[] = [
  { key: "communication", label: "Communication" },
  { key: "contacts_leads", label: "Contacts & Leads" },
  { key: "tasks", label: "Tasks" },
  { key: "appointments", label: "Appointments" },
  { key: "documents_organizers", label: "Documents & Organizers" },
  { key: "pipeline_engagements", label: "Pipeline & Engagements" },
  { key: "billing", label: "Billing" },
  { key: "tax_workflow", label: "Tax Workflow" },
  { key: "workflow_control", label: "Workflow Control" },
];

export const ACTION_TYPES = [
  { value: "delay", label: "Wait / Delay", category: "workflow_control", description: "Pause before continuing to the next step.", keywords: "wait pause business hours" },
  { value: "send_email", label: "Send an email", category: "communication", description: "Send a templated email to the client.", keywords: "message mail" },
  { value: "send_sms", label: "Send a text", category: "communication", description: "Send a templated text message to the client.", keywords: "message sms text" },
  { value: "create_task", label: "Create a task", category: "tasks", description: "Create a task assigned to a staff member.", keywords: "todo assign" },
  { value: "create_appointment", label: "Schedule an appointment (request)", category: "appointments", description: "Book an appointment on the calendar.", keywords: "meeting schedule calendar" },
  { value: "send_organizer_template", label: "Push an organizer to the client's portal", category: "documents_organizers", description: "Send an intake organizer to the client's portal.", keywords: "intake form organizer" },
  { value: "create_engagement", label: "Create the engagement and start its pipeline", category: "pipeline_engagements", description: "Create the engagement and start its pipeline (organizer-submission workflows only).", keywords: "engagement pipeline start" },
  { value: "send_engagement_letter", label: "Send the engagement letter for signature", category: "tax_workflow", description: "Queue the engagement letter for e-signature.", keywords: "signature sign letter" },
  { value: "change_stage", label: "Advance to the next pipeline stage", category: "pipeline_engagements", description: "Advance the client or engagement to the next stage in its active pipeline.", keywords: "stage advance pipeline" },
  { value: "send_document_request", label: "Send a document request", category: "documents_organizers", description: "Send a document request built from a template.", keywords: "documents upload request" },
  { value: "assign_user", label: "Assign staff", category: "contacts_leads", description: "Assign a staff member to the client or engagement.", keywords: "staff owner assign" },
  { value: "send_notification", label: "Notify a staff member", category: "communication", description: "Notify staff members in-app or by email.", keywords: "alert notify staff" },
  { value: "move_pipeline_stage", label: "Move to a pipeline stage", category: "pipeline_engagements", description: "Move the client or engagement forward to a specific pipeline stage.", keywords: "stage move pipeline" },
  { value: "move_lead_to_service_pipeline", label: "Move the lead to the pipeline matching their service", category: "pipeline_engagements", description: "Start the pipeline matching the lead's selected service.", keywords: "lead pipeline service" },
  { value: "mark_lead_lost", label: "Mark the lead lost", category: "contacts_leads", description: "Mark the lead as lost.", keywords: "lost lead close" },
  { value: "convert_lead_to_client", label: "Convert the lead to an active client", category: "contacts_leads", description: "Convert the lead into an active client.", keywords: "convert lead client" },
  { value: "update_client", label: "Update a client field", category: "contacts_leads", description: "Update a single field on the client record.", keywords: "edit field update" },
  { value: "create_client", label: "Create a new client", category: "contacts_leads", description: "Create a new client, or reuse a matching one by email/phone.", keywords: "new client contact" },
  { value: "create_quote", label: "Create a quote", category: "billing", description: "Create a draft quote.", keywords: "quote estimate billing" },
  { value: "send_quote", label: "Send the draft quote", category: "billing", description: "Send the most recent draft quote.", keywords: "quote send billing" },
  { value: "add_tag", label: "Add a tag to the client", category: "contacts_leads", description: "Add a tag to the client.", keywords: "tag label" },
  { value: "remove_tag", label: "Remove a tag from the client", category: "contacts_leads", description: "Remove a tag from the client.", keywords: "tag label remove" },
  { value: "invite_to_portal", label: "Invite client to portal (skips if already invited)", category: "contacts_leads", description: "Invite the client to the portal (skips if already invited).", keywords: "portal invite" },
  { value: "add_note", label: "Add an internal note", category: "contacts_leads", description: "Add an internal note to the client or engagement.", keywords: "note internal" },
  { value: "send_portal_message", label: "Send a portal message", category: "communication", description: "Send a message to the client's portal inbox.", keywords: "message portal" },
  { value: "start_workflow", label: "Start another workflow", category: "workflow_control", description: "Start another published workflow for this same client or engagement.", keywords: "workflow start chain" },
  { value: "end_workflow", label: "End this workflow", category: "workflow_control", description: "End this workflow run immediately.", keywords: "stop end exit" },
  { value: "webhook", label: "Call a webhook", category: "workflow_control", description: "Send the run's data to an external URL.", keywords: "webhook api integration http" },
  { value: "add_dnd", label: "Opt the client out of SMS/email", category: "communication", description: "Opt the client out of SMS and/or email sends.", keywords: "dnd opt out unsubscribe" },
  { value: "remove_dnd", label: "Opt the client back into SMS/email", category: "communication", description: "Opt the client back into SMS and/or email sends.", keywords: "dnd opt in resubscribe" },
];

const DND_CHANNELS = [
  { value: "both", label: "SMS and email" },
  { value: "sms", label: "SMS only" },
  { value: "email", label: "Email only" },
];

const TASK_PRIORITIES = ["low", "medium", "high"];
const NOTIFICATION_PRIORITIES = ["Low", "Medium", "High"];
const UPDATE_CLIENT_FIELDS = [
  { value: "first_name", label: "First name" },
  { value: "middle_name", label: "Middle name" },
  { value: "last_name", label: "Last name" },
  { value: "suffix", label: "Suffix" },
  { value: "business_name", label: "Business name" },
  { value: "client_type", label: "Client type" },
  { value: "primary_email", label: "Email" },
  { value: "primary_phone", label: "Phone" },
  { value: "address_line1", label: "Address line 1" },
  { value: "address_line2", label: "Address line 2" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "postal_code", label: "ZIP / postal code" },
  { value: "country", label: "Country" },
  { value: "relationship_manager_id", label: "Relationship manager" },
];
const CLIENT_TYPES = ["individual", "business", "trust", "estate", "organization"];

export function actionIcon(type: string) {
  if (type === "delay") return <Clock size={15} />;
  if (type === "create_appointment") return <CalendarPlus size={15} />;
  if (type === "send_email") return <Mail size={15} />;
  if (type === "send_sms") return <MessageSquare size={15} />;
  if (type === "send_organizer_template") return <BookOpen size={15} />;
  if (type === "create_engagement") return <Workflow size={15} />;
  if (type === "send_engagement_letter") return <FileSignature size={15} />;
  if (type === "change_stage") return <ArrowRightCircle size={15} />;
  if (type === "send_document_request") return <FolderInput size={15} />;
  if (type === "assign_user") return <UserCog size={15} />;
  if (type === "send_notification") return <Bell size={15} />;
  if (type === "move_pipeline_stage") return <Route size={15} />;
  if (type === "move_lead_to_service_pipeline") return <Milestone size={15} />;
  if (type === "mark_lead_lost") return <UserX size={15} />;
  if (type === "convert_lead_to_client") return <UserCheck size={15} />;
  if (type === "update_client") return <Pencil size={15} />;
  if (type === "create_client") return <UserPlus size={15} />;
  if (type === "create_quote") return <DollarSign size={15} />;
  if (type === "send_quote") return <Send size={15} />;
  if (type === "add_tag" || type === "remove_tag") return <Tag size={15} />;
  if (type === "invite_to_portal") return <LogIn size={15} />;
  if (type === "add_note") return <StickyNote size={15} />;
  if (type === "send_portal_message") return <MessageCircle size={15} />;
  if (type === "start_workflow") return <PlayCircle size={15} />;
  if (type === "end_workflow") return <StopCircle size={15} />;
  if (type === "webhook") return <Webhook size={15} />;
  if (type === "add_dnd") return <BellOff size={15} />;
  if (type === "remove_dnd") return <BellRing size={15} />;
  return <CheckSquare size={15} />;
}

// Shared by every free-text step field that execute_automation_step() runs
// through render_merge_fields() (task/appointment/quote titles & bodies,
// document request titles, notification messages, notes, portal messages) --
// a click-to-insert {{token}} picker so staff don't have to know or type the
// syntax by hand, same UX as the email/SMS template editor. Scoped to
// AUTOMATION_MERGE_FIELD_GROUPS rather than the full template catalog since
// that's genuinely all a run's context can resolve.
function MergeableField({
  as = "input",
  label,
  fieldKey,
  config,
  setField,
  canManage,
  placeholder,
  rows,
}: {
  as?: "input" | "textarea";
  label: string;
  fieldKey: string;
  config: Record<string, unknown>;
  setField: (key: string, value: string) => void;
  canManage: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const value = (config[fieldKey] as string) ?? "";
  const inputClass = "rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60";
  return (
    <div className="col-span-2 flex flex-col gap-1 text-xs text-muted">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <MergeFieldPicker
          label="Insert"
          disabled={!canManage}
          groups={AUTOMATION_MERGE_FIELD_GROUPS}
          onInsert={(token) => insertAtFieldCursor(ref.current, value, token, (v) => setField(fieldKey, v))}
        />
      </div>
      {as === "textarea" ? (
        <textarea
          ref={ref as RefObject<HTMLTextAreaElement>}
          disabled={!canManage}
          rows={rows ?? 2}
          value={value}
          onChange={(e) => setField(fieldKey, e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      ) : (
        <input
          ref={ref as RefObject<HTMLInputElement>}
          disabled={!canManage}
          value={value}
          onChange={(e) => setField(fieldKey, e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}

export function StepCard({
  workspaceId,
  step,
  index,
  total,
  emailTemplates,
  smsTemplates,
  organizerTemplates,
  engagementLetterTemplates,
  documentRequestTemplates,
  services,
  serviceCategories,
  pipelines,
  staffOptions,
  automationOptions,
  tagOptions = [],
  roleOptions = [],
  canManage,
  onSaved,
  hideReorder,
}: {
  workspaceId: string;
  step: WorkflowStepRow;
  index: number;
  total: number;
  emailTemplates: MessageTemplateOption[];
  smsTemplates: MessageTemplateOption[];
  organizerTemplates: TemplateOption[];
  engagementLetterTemplates: TemplateOption[];
  documentRequestTemplates: TemplateOption[];
  services: TemplateOption[];
  serviceCategories: TemplateOption[];
  pipelines: PipelineOption[];
  staffOptions: StaffOption[];
  automationOptions: AutomationOption[];
  tagOptions?: string[];
  roleOptions?: RoleOption[];
  canManage: boolean;
  onSaved: () => void;
  hideReorder?: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [actionType, setActionType] = useState(step.action_type === "business_hours_delay" ? "delay" : step.action_type);
  const [config, setConfig] = useState<Record<string, unknown>>(step.action_config ?? {});
  // Separate from any action-specific "Title" field below (e.g. create_task's
  // task title, create_appointment's appointment title) -- those name the
  // record the step creates. This names the step itself on the canvas/step
  // list, and applies the same way regardless of action type, unlike those
  // per-type fields which only exist for the handful of actions whose
  // underlying record actually has its own title.
  const [displayName, setDisplayName] = useState(step.display_name ?? "");
  const [delayUnit, setDelayUnit] = useState<"minutes" | "days">(step.action_config?.delay_unit === "days" ? "days" : "minutes");
  const [delayValue, setDelayValue] = useState(() => {
    const mins = step.delay_minutes ?? 0;
    return delayUnit === "days" ? String(mins / 1440) : String(mins);
  });
  // business_hours_delay is a real, separate action_type in the DB (its own
  // scheduling math via compute_business_hours_deadline) but isn't in
  // ACTION_TYPES -- it's presented as a mode of the regular "Wait / Delay"
  // action instead, since the two only differ in how the wait is counted.
  const [useBusinessHours, setUseBusinessHours] = useState(step.action_type === "business_hours_delay");
  const [requiresApproval, setRequiresApproval] = useState(step.requires_approval);
  const [approverRoleId, setApproverRoleId] = useState(step.approver_role_id ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<{
    kind: "email" | "sms";
    row: { id: string; name: string; status: string; workspace_id: string | null; subject?: string | null; body_html?: string | null; body?: string | null };
  } | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [creatingTemplateKind, setCreatingTemplateKind] = useState<"email" | "sms" | "organizer" | "engagement_letter" | null>(null);
  // Newly created templates this session -- shown in their dropdown right
  // away rather than waiting on the parent Server Component's router.refresh()
  // to land, since that's a real network round trip and the selection should
  // feel instant.
  const [extraEmailTemplates, setExtraEmailTemplates] = useState<MessageTemplateOption[]>([]);
  const [extraSmsTemplates, setExtraSmsTemplates] = useState<MessageTemplateOption[]>([]);
  const [extraOrganizerTemplates, setExtraOrganizerTemplates] = useState<TemplateOption[]>([]);
  const [extraEngagementLetterTemplates, setExtraEngagementLetterTemplates] = useState<TemplateOption[]>([]);
  // Organizer/engagement letter templates need their full builder page to get
  // real content -- point staff at it right after the quick-create stub saves.
  const [justCreatedLink, setJustCreatedLink] = useState<{ kind: "organizer" | "engagement_letter"; id: string; name: string } | null>(null);

  const emailOptions = [...emailTemplates, ...extraEmailTemplates.filter((e) => !emailTemplates.some((t) => t.id === e.id))];
  const smsOptions = [...smsTemplates, ...extraSmsTemplates.filter((e) => !smsTemplates.some((t) => t.id === e.id))];
  const organizerOptions = [...organizerTemplates, ...extraOrganizerTemplates.filter((e) => !organizerTemplates.some((t) => t.id === e.id))];
  const engagementLetterOptions = [
    ...engagementLetterTemplates,
    ...extraEngagementLetterTemplates.filter((e) => !engagementLetterTemplates.some((t) => t.id === e.id)),
  ];

  async function openTemplateEditor(kind: "email" | "sms") {
    const slug = config.template_slug as string | undefined;
    if (!slug) return;
    setLoadingTemplate(true);
    const table = kind === "email" ? "email_templates" : "sms_templates";
    const columns = kind === "email" ? "id, name, status, workspace_id, subject, body_html" : "id, name, status, workspace_id, body";
    const { data, error: fetchError } = await supabase
      .from(table)
      .select(columns)
      .eq("workspace_id", workspaceId)
      .eq("slug", slug)
      .single();
    setLoadingTemplate(false);
    if (fetchError || !data) {
      toast.show(fetchError?.message ?? "Couldn't load this template", "error");
      return;
    }
    setEditingTemplate({ kind, row: data as never });
  }

  function setField(key: string, value: string) {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
  }

  function changeDelayUnit(nextUnit: "minutes" | "days") {
    const currentMinutes = delayUnit === "days" ? (parseFloat(delayValue) || 0) * 1440 : parseFloat(delayValue) || 0;
    setDelayUnit(nextUnit);
    setDelayValue(nextUnit === "days" ? String(currentMinutes / 1440) : String(Math.round(currentMinutes)));
    setSaved(false);
  }

  // Accepts an optional config override so a template pick/create can save
  // the step immediately (see the onSuccess handlers below) instead of
  // silently relying on stale closure state -- setConfig() doesn't apply
  // until the next render, so reading `config` right after calling it would
  // still see the old value.
  async function save(configOverride?: Record<string, unknown>) {
    const configToSave = configOverride ?? config;
    if (actionType === "add_tag" || actionType === "remove_tag") {
      const tag = (configToSave.tag as string | undefined)?.trim();
      if (tag && !(await ensureTagConfirmed(supabase, workspaceId, tag))) return;
    }

    setSaving(true);
    setError(null);
    const isDelay = actionType === "delay";
    const isDurationMode = !configToSave.wait_mode || configToSave.wait_mode === "duration";
    const savesAsBusinessHours = isDelay && isDurationMode && useBusinessHours;
    const effectiveActionType = savesAsBusinessHours ? "business_hours_delay" : actionType;
    const delayMinutes =
      isDelay && !savesAsBusinessHours ? Math.round(delayUnit === "days" ? (parseFloat(delayValue) || 0) * 1440 : parseFloat(delayValue) || 0) : 0;
    const finalConfig = savesAsBusinessHours
      ? { hours: (configToSave.hours as string) ?? "24" }
      : ((isDelay ? { ...configToSave, delay_unit: delayUnit } : configToSave) as never);
    const { error: updateError } = await supabase
      .from("automation_steps")
      .update({
        action_type: effectiveActionType,
        action_config: finalConfig as never,
        delay_minutes: delayMinutes,
        requires_approval: requiresApproval,
        approver_role_id: requiresApproval && approverRoleId ? approverRoleId : null,
        display_name: displayName.trim() || null,
      })
      .eq("id", step.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
    onSaved();
  }

  async function move(direction: "up" | "down") {
    const { error } = await supabase.rpc("reorder_automation_step", { p_step_id: step.id, p_direction: direction });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    onSaved();
  }

  async function remove() {
    if (!window.confirm("Remove this step?")) return;
    const { error } = await supabase.from("automation_steps").delete().eq("id", step.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Step removed", "success");
    onSaved();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surfaceMuted text-xs text-muted">{index + 1}</span>
          {actionIcon(actionType)}
          Step {index + 1}
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            {!hideReorder && (
              <>
                <button type="button" disabled={index === 0} onClick={() => move("up")} className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30" aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button type="button" disabled={index === total - 1} onClick={() => move("down")} className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30" aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
              </>
            )}
            <button type="button" onClick={remove} className="rounded p-1 text-muted hover:text-danger" aria-label="Delete step">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
        Step name (optional)
        <input
          disabled={!canManage}
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setSaved(false);
          }}
          placeholder={actionType === "condition" ? "Condition" : ACTION_TYPES.find((a) => a.value === actionType)?.label ?? actionType}
          className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Action
          <InlineStepPickerField
            disabled={!canManage}
            value={actionType}
            items={ACTION_TYPES}
            categories={ACTION_CATEGORIES}
            icon={actionIcon}
            onChange={(value) => {
              setActionType(value);
              setConfig({});
              setSaved(false);
            }}
          />
        </label>
        {actionType === "delay" && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Wait mode
            <select
              disabled={!canManage}
              value={(config.wait_mode as string) ?? "duration"}
              onChange={(e) => setField("wait_mode", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="duration">For a duration</option>
              <option value="until_date">Until a specific date/time</option>
              <option value="until_condition">Until a condition is met</option>
            </select>
          </label>
        )}

        {actionType === "delay" && (!config.wait_mode || config.wait_mode === "duration") && (
          <>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Count as
              <div className="flex gap-4 pt-1">
                {([
                  { value: false, label: "Regular time" },
                  { value: true, label: "Business hours" },
                ] as const).map((opt) => (
                  <label key={String(opt.value)} className="flex items-center gap-1.5 text-sm text-ink">
                    <input
                      type="radio"
                      disabled={!canManage}
                      checked={useBusinessHours === opt.value}
                      onChange={() => {
                        setUseBusinessHours(opt.value);
                        setSaved(false);
                      }}
                      className="border-border text-accent focus:ring-accent disabled:opacity-60"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </label>

            {useBusinessHours ? (
              <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
                Wait for (business hours)
                <input
                  disabled={!canManage}
                  type="number"
                  min={0}
                  step="0.5"
                  value={(config.hours as string) ?? ""}
                  onChange={(e) => setField("hours", e.target.value)}
                  placeholder="24"
                  className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                />
                <span className="mt-1 text-[11px] normal-case text-muted">
                  Only counts hours inside the firm&apos;s configured business hours (Settings &rarr; Firm Profile) -- nights,
                  weekends, and office closures don&apos;t count toward this wait.
                </span>
              </label>
            ) : (
              <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
                Wait for
                <div className="flex gap-1.5">
                  <input
                    disabled={!canManage}
                    type="number"
                    min={0}
                    value={delayValue}
                    onChange={(e) => {
                      setDelayValue(e.target.value);
                      setSaved(false);
                    }}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                  <select
                    disabled={!canManage}
                    value={delayUnit}
                    onChange={(e) => changeDelayUnit(e.target.value as "minutes" | "days")}
                    className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="days">Days</option>
                  </select>
                </div>
                <span className="mt-1 text-[11px] normal-case text-muted">
                  Wire this step&apos;s connections on the diagram to control what it waits before or after -- drag its top handle
                  from the step that should finish first, and its bottom handle to whichever step should run once the wait is
                  over.
                </span>
              </label>
            )}
          </>
        )}

        {actionType === "delay" && config.wait_mode === "until_date" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Wait until
            <input
              disabled={!canManage}
              type="datetime-local"
              value={typeof config.wait_until_at === "string" ? config.wait_until_at.slice(0, 16) : ""}
              onChange={(e) => setField("wait_until_at", e.target.value ? new Date(e.target.value).toISOString() : "")}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
          </label>
        )}

        {actionType === "delay" && config.wait_mode === "until_condition" && (
          <div className="col-span-2 flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs text-muted">Wait until</p>
              <ConditionsEditor
                conditions={(config.wait_conditions as Condition[]) ?? []}
                onChange={(next) => {
                  setConfig((c) => ({ ...c, wait_conditions: next as never }));
                  setSaved(false);
                }}
                staffOptions={staffOptions}
                services={services}
                serviceCategories={serviceCategories}
                pipelines={pipelines}
                organizerTemplates={organizerTemplates}
                disabled={!canManage}
              />
            </div>
            <label className="flex w-40 flex-col gap-1 text-xs text-muted">
              Give up after (days)
              <input
                disabled={!canManage}
                type="number"
                min={1}
                value={(config.wait_timeout_days as string) ?? "30"}
                onChange={(e) => setField("wait_timeout_days", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <span className="text-[11px] normal-case text-muted">
              If the condition still hasn&apos;t been met after that many days, the workflow continues anyway instead of waiting
              forever.
            </span>
          </div>
        )}

        {actionType === "send_email" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Email template
            <div className="flex gap-1.5">
              <select
                disabled={!canManage}
                value={(config.template_slug as string) ?? ""}
                onChange={(e) => setField("template_slug", e.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="" disabled>
                  Choose a published email template
                </option>
                {emailOptions.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
              {config.template_slug ? (
                <button
                  type="button"
                  onClick={() => openTemplateEditor("email")}
                  disabled={loadingTemplate}
                  title="Edit this email template"
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-muted hover:bg-surfaceMuted disabled:opacity-60"
                >
                  <Pencil size={14} />
                </button>
              ) : null}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreatingTemplateKind("email")}
                  title="Create a new email template"
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-muted hover:bg-surfaceMuted"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            {emailOptions.length === 0 && (
              <span className="text-[11px] text-warning">
                No published email templates yet -- a template stays hidden here until you publish it from{" "}
                <a href="/automations" target="_blank" rel="noreferrer" className="underline">
                  Email &amp; SMS
                </a>
                , or create one with the + button.
              </span>
            )}
            {creatingTemplateKind === "email" && (
              <div className="mt-1">
                <CreateTemplateForm
                  workspaceId={workspaceId}
                  kind="email"
                  defaultOpen
                  onSuccess={(row) => {
                    setExtraEmailTemplates((prev) => [...prev, { id: row.id, name: row.name, slug: row.slug }]);
                    const nextConfig = { ...config, template_slug: row.slug };
                    setConfig(nextConfig);
                    setCreatingTemplateKind(null);
                    setEditingTemplate({
                      kind: "email",
                      row: { id: row.id, name: row.name, status: "draft", workspace_id: workspaceId, subject: "", body_html: "" },
                    });
                    // The template-body editor that opens next has its own
                    // separate Save button (for the template row itself) --
                    // save the step right away so picking/creating a
                    // template is never lost if the user closes that modal
                    // without also clicking "Save step" below it.
                    void save(nextConfig);
                  }}
                />
              </div>
            )}
          </label>
        )}

        {actionType === "send_sms" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            SMS template
            <div className="flex gap-1.5">
              <select
                disabled={!canManage}
                value={(config.template_slug as string) ?? ""}
                onChange={(e) => setField("template_slug", e.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="" disabled>
                  Choose a published SMS template
                </option>
                {smsOptions.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
              {config.template_slug ? (
                <button
                  type="button"
                  onClick={() => openTemplateEditor("sms")}
                  disabled={loadingTemplate}
                  title="Edit this SMS template"
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-muted hover:bg-surfaceMuted disabled:opacity-60"
                >
                  <Pencil size={14} />
                </button>
              ) : null}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreatingTemplateKind("sms")}
                  title="Create a new SMS template"
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-muted hover:bg-surfaceMuted"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            {smsOptions.length === 0 && (
              <span className="text-[11px] text-warning">
                No published SMS templates yet -- a template stays hidden here until you publish it from{" "}
                <a href="/automations" target="_blank" rel="noreferrer" className="underline">
                  Email &amp; SMS
                </a>
                , or create one with the + button.
              </span>
            )}
            {creatingTemplateKind === "sms" && (
              <div className="mt-1">
                <CreateTemplateForm
                  workspaceId={workspaceId}
                  kind="sms"
                  defaultOpen
                  onSuccess={(row) => {
                    setExtraSmsTemplates((prev) => [...prev, { id: row.id, name: row.name, slug: row.slug }]);
                    const nextConfig = { ...config, template_slug: row.slug };
                    setConfig(nextConfig);
                    setCreatingTemplateKind(null);
                    setEditingTemplate({
                      kind: "sms",
                      row: { id: row.id, name: row.name, status: "draft", workspace_id: workspaceId, body: "" },
                    });
                    // The template-body editor that opens next has its own
                    // separate Save button (for the template row itself) --
                    // save the step right away so picking/creating a
                    // template is never lost if the user closes that modal
                    // without also clicking "Save step" below it.
                    void save(nextConfig);
                  }}
                />
              </div>
            )}
          </label>
        )}

        {editingTemplate && (
          <div className="col-span-2">
            <TemplateEditRow
              kind={editingTemplate.kind}
              template={editingTemplate.row}
              workspaceId={workspaceId}
              onClose={() => setEditingTemplate(null)}
              onDuplicated={(row) => {
                setField("template_slug", (row as unknown as { slug: string }).slug);
                setEditingTemplate(null);
              }}
            />
          </div>
        )}

        {actionType === "create_task" && (
          <>
            <MergeableField label="Task title" fieldKey="title" config={config} setField={setField} canManage={canManage} placeholder="Automated task" />
            <MergeableField as="textarea" label="Description" fieldKey="description" config={config} setField={setField} canManage={canManage} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Due in (days)
              <input
                disabled={!canManage}
                type="number"
                min={0}
                value={(config.due_in_days as string) ?? ""}
                onChange={(e) => setField("due_in_days", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Priority
              <select
                disabled={!canManage}
                value={(config.priority as string) ?? "medium"}
                onChange={(e) => setField("priority", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink capitalize focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Visible to
              <select
                disabled={!canManage}
                value={(config.visibility as string) ?? "internal"}
                onChange={(e) => setField("visibility", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="internal">Staff only</option>
                <option value="client">Staff and client (shows in portal)</option>
              </select>
            </label>
          </>
        )}

        {actionType === "create_appointment" && (
          <>
            <MergeableField label="Title" fieldKey="title" config={config} setField={setField} canManage={canManage} placeholder="Appointment" />
            <MergeableField as="textarea" label="Description" fieldKey="description" config={config} setField={setField} canManage={canManage} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Days from now
              <input
                disabled={!canManage}
                type="number"
                min={0}
                value={(config.days_from_now as string) ?? ""}
                onChange={(e) => setField("days_from_now", e.target.value)}
                placeholder="1"
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Time of day
              <input
                disabled={!canManage}
                type="time"
                value={(config.time_of_day as string) ?? ""}
                onChange={(e) => setField("time_of_day", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Duration (minutes)
              <input
                disabled={!canManage}
                type="number"
                min={5}
                step={5}
                value={(config.duration_minutes as string) ?? ""}
                onChange={(e) => setField("duration_minutes", e.target.value)}
                placeholder="30"
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Location (optional)
              <input
                disabled={!canManage}
                value={(config.location as string) ?? ""}
                onChange={(e) => setField("location", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Staff member (optional)
              <select
                disabled={!canManage}
                value={(config.staff_id as string) ?? ""}
                onChange={(e) => setField("staff_id", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="">Unassigned</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name ?? "Staff"}
                  </option>
                ))}
              </select>
            </label>
            <span className="col-span-2 text-[11px] text-muted">
              Lands on the calendar as a scheduled request for staff to confirm or reschedule -- there&apos;s no
              availability check yet, so pick a time that&apos;s likely to work.
            </span>
          </>
        )}

        {(actionType === "add_dnd" || actionType === "remove_dnd") && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Channel
            <select
              disabled={!canManage}
              value={(config.channel as string) ?? "both"}
              onChange={(e) => setField("channel", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              {DND_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">
              {actionType === "add_dnd"
                ? "Future automated sends on this channel skip this client instead of failing the workflow."
                : "Re-enables automated sends on this channel for this client."}
            </span>
          </label>
        )}

        {actionType === "send_organizer_template" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Organizer
            <div className="flex gap-1.5">
              <select
                disabled={!canManage}
                value={(config.organizer_template_id as string) ?? ""}
                onChange={(e) => setField("organizer_template_id", e.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="">Auto-detect from the service selected</option>
                {organizerOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreatingTemplateKind("organizer")}
                  title="Create a new organizer"
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-muted hover:bg-surfaceMuted"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            <span className="text-[11px] text-muted">
              Auto-detect sends whichever organizer is linked to the service that triggered this run (set per
              service under Services) -- pick a specific template instead only if this step should always send the
              same organizer regardless of service.
            </span>
            {organizerOptions.length === 0 && (
              <span className="text-[11px] text-warning">
                No published organizers yet -- an organizer stays hidden here until you publish it from{" "}
                <a href="/templates" target="_blank" rel="noreferrer" className="underline">
                  Form Templates
                </a>
                , or create one with the + button.
              </span>
            )}
            {creatingTemplateKind === "organizer" && (
              <div className="mt-1">
                <CreateQuickTemplate
                  workspaceId={workspaceId}
                  kind="organizer"
                  defaultOpen
                  onSuccess={(row) => {
                    setExtraOrganizerTemplates((prev) => [...prev, row]);
                    setField("organizer_template_id", row.id);
                    setCreatingTemplateKind(null);
                    setJustCreatedLink({ kind: "organizer", id: row.id, name: row.name });
                  }}
                />
              </div>
            )}
            {justCreatedLink?.kind === "organizer" && justCreatedLink.id === config.organizer_template_id && (
              <a
                href={`/templates/organizers/${justCreatedLink.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] font-medium text-accent hover:underline"
              >
                Finish building &quot;{justCreatedLink.name}&quot; <ExternalLink size={11} />
              </a>
            )}
          </label>
        )}

        {actionType === "create_engagement" && (
          <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
            Creates an engagement from the service already resolved on the organizer submission that triggered this run, and starts its
            pipeline. Only works when this step follows an &quot;An organizer is submitted&quot; trigger.
          </p>
        )}

        {actionType === "send_engagement_letter" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Engagement letter
            <div className="flex gap-1.5">
              <select
                disabled={!canManage}
                value={(config.engagement_letter_template_id as string) ?? ""}
                onChange={(e) => setField("engagement_letter_template_id", e.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="">Use the engagement&apos;s service&apos;s default letter</option>
                {engagementLetterOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreatingTemplateKind("engagement_letter")}
                  title="Create a new engagement letter"
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-muted hover:bg-surfaceMuted"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            {engagementLetterOptions.length === 0 && (
              <span className="text-[11px] text-warning">
                No published engagement letters yet -- a template stays hidden here until you publish it from{" "}
                <a href="/templates" target="_blank" rel="noreferrer" className="underline">
                  Form Templates
                </a>
                , or create one with the + button.
              </span>
            )}
            {creatingTemplateKind === "engagement_letter" && (
              <div className="mt-1">
                <CreateQuickTemplate
                  workspaceId={workspaceId}
                  kind="engagement_letter"
                  defaultOpen
                  onSuccess={(row) => {
                    setExtraEngagementLetterTemplates((prev) => [...prev, row]);
                    setField("engagement_letter_template_id", row.id);
                    setCreatingTemplateKind(null);
                    setJustCreatedLink({ kind: "engagement_letter", id: row.id, name: row.name });
                  }}
                />
              </div>
            )}
            {justCreatedLink?.kind === "engagement_letter" && justCreatedLink.id === config.engagement_letter_template_id && (
              <a
                href={`/templates/engagement-letters/${justCreatedLink.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] font-medium text-accent hover:underline"
              >
                Finish building &quot;{justCreatedLink.name}&quot; <ExternalLink size={11} />
              </a>
            )}
          </label>
        )}

        {actionType === "change_stage" && (
          <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
            Marks the current pipeline stage complete, moving into the next stage -- the engagement&apos;s pipeline if this run has an
            engagement, otherwise the lead&apos;s pipeline (started by a &quot;Move the lead to a pipeline stage&quot; step). Only works
            if there&apos;s an active pipeline to advance.
          </p>
        )}

        {actionType === "send_document_request" && (
          <>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Document request template
              <select
                disabled={!canManage}
                value={(config.document_request_template_id as string) ?? ""}
                onChange={(e) => setField("document_request_template_id", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="" disabled>
                  Choose a document request template
                </option>
                {documentRequestTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <MergeableField label="Title" fieldKey="title" config={config} setField={setField} canManage={canManage} placeholder="Requested documents" />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Due in (days)
              <input
                disabled={!canManage}
                type="number"
                min={0}
                value={(config.due_in_days as string) ?? ""}
                onChange={(e) => setField("due_in_days", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
          </>
        )}

        {actionType === "assign_user" && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Assign
              <select
                disabled={!canManage}
                value={(config.target as string) ?? "engagement"}
                onChange={(e) => setField("target", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="engagement">The engagement</option>
                <option value="client">The client</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              How
              <select
                disabled={!canManage}
                value={(config.assignment_mode as string) ?? "fixed"}
                onChange={(e) => setField("assignment_mode", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="fixed">A specific staff member</option>
                <option value="round_robin">Round robin -- whoever has the fewest open ones</option>
              </select>
            </label>

            {(!config.assignment_mode || config.assignment_mode === "fixed") && (
              <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
                Staff member
                <select
                  disabled={!canManage}
                  value={(config.staff_id as string) ?? ""}
                  onChange={(e) => setField("staff_id", e.target.value)}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                >
                  <option value="" disabled>
                    Choose staff
                  </option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ?? "Staff"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config.assignment_mode === "round_robin" && (
              <div className="col-span-2 flex flex-col gap-1.5 text-xs text-muted">
                Eligible staff (leave all unchecked to include everyone active)
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                  {staffOptions.map((s) => {
                    const pool: string[] = Array.isArray(config.staff_pool) ? (config.staff_pool as string[]) : [];
                    const checked = pool.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-1.5 text-sm text-ink">
                        <input
                          type="checkbox"
                          disabled={!canManage}
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked ? [...pool, s.id] : pool.filter((id) => id !== s.id);
                            setConfig((c) => ({ ...c, staff_pool: next as never }));
                            setSaved(false);
                          }}
                          className="rounded border-border text-accent focus:ring-accent disabled:opacity-60"
                        />
                        {s.display_name ?? "Staff"}
                      </label>
                    );
                  })}
                </div>
                <span className="mt-1 normal-case text-[11px] text-muted">
                  Ties (same open count) are broken randomly, so assignments spread out evenly over time even between staff who
                  never get further ahead or behind.
                </span>
              </div>
            )}
          </>
        )}

        {actionType === "send_notification" && (
          <>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Notify
              <select
                disabled={!canManage}
                value={(config.staff_id as string) ?? ""}
                onChange={(e) => setField("staff_id", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="">Account owner (default)</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name ?? "Staff"}
                    {s.is_owner ? " (Owner)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Send via
              <div className="flex items-center gap-4 pt-1">
                {(["In-App", "Email"] as const).map((channel) => {
                  const selected: string[] = Array.isArray(config.channels) ? (config.channels as string[]) : ["In-App"];
                  const checked = selected.includes(channel);
                  return (
                    <label key={channel} className="flex items-center gap-1.5 text-sm text-ink">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...selected, channel] : selected.filter((c) => c !== channel);
                          setConfig((c) => ({ ...c, channels: next.length > 0 ? next : ["In-App"] }));
                          setSaved(false);
                        }}
                        className="rounded border-border text-accent focus:ring-accent disabled:opacity-60"
                      />
                      {channel === "In-App" ? "Staff portal" : "Email"}
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Priority
              <select
                disabled={!canManage}
                value={(config.priority as string) ?? "Medium"}
                onChange={(e) => setField("priority", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                {NOTIFICATION_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <MergeableField as="textarea" label="Message" fieldKey="message" config={config} setField={setField} canManage={canManage} />
          </>
        )}

        {actionType === "move_pipeline_stage" && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Pipeline
              <select
                disabled={!canManage}
                value={(config.process_id as string) ?? ""}
                onChange={(e) => setField("process_id", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="" disabled>
                  Choose a pipeline
                </option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Target stage
              <select
                disabled={!canManage || !config.process_id}
                value={(config.process_stage_id as string) ?? ""}
                onChange={(e) => setField("process_stage_id", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="" disabled>
                  Choose a stage
                </option>
                {(pipelines.find((p) => p.id === config.process_id)?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
              Moves the client or engagement forward to this stage, completing every stage in between. If it isn&apos;t already in this
              pipeline, it starts one. Moving backward isn&apos;t supported.
            </p>
          </>
        )}

        {actionType === "mark_lead_lost" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Reason (optional)
            <input
              disabled={!canManage}
              value={(config.reason as string) ?? ""}
              onChange={(e) => setField("reason", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
          </label>
        )}

        {actionType === "convert_lead_to_client" && (
          <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
            Moves the lead off the pipeline and marks it an active client. Only works on a run with a client.
          </p>
        )}

        {actionType === "update_client" && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Field
              <select
                disabled={!canManage}
                value={(config.field as string) ?? ""}
                onChange={(e) => setField("field", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="" disabled>
                  Choose a field
                </option>
                {UPDATE_CLIENT_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {config.field === "relationship_manager_id" ? (
              <label className="flex flex-col gap-1 text-xs text-muted">
                New value
                <select
                  disabled={!canManage}
                  value={(config.value as string) ?? ""}
                  onChange={(e) => setField("value", e.target.value)}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                >
                  <option value="" disabled>
                    Choose staff
                  </option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ?? "Staff"}
                    </option>
                  ))}
                </select>
              </label>
            ) : config.field === "client_type" ? (
              <label className="flex flex-col gap-1 text-xs text-muted">
                New value
                <select
                  disabled={!canManage}
                  value={(config.value as string) ?? ""}
                  onChange={(e) => setField("value", e.target.value)}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink capitalize focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                >
                  <option value="" disabled>
                    Choose a type
                  </option>
                  {CLIENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-muted">
                New value
                <input
                  disabled={!canManage}
                  type={config.field === "primary_email" ? "email" : "text"}
                  value={(config.value as string) ?? ""}
                  onChange={(e) => setField("value", e.target.value)}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                />
              </label>
            )}
          </>
        )}

        {actionType === "create_client" && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              First name
              <input
                disabled={!canManage}
                value={(config.first_name as string) ?? ""}
                onChange={(e) => setField("first_name", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Last name
              <input
                disabled={!canManage}
                value={(config.last_name as string) ?? ""}
                onChange={(e) => setField("last_name", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Email
              <input
                disabled={!canManage}
                type="email"
                value={(config.primary_email as string) ?? ""}
                onChange={(e) => setField("primary_email", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Phone
              <input
                disabled={!canManage}
                value={(config.primary_phone as string) ?? ""}
                onChange={(e) => setField("primary_phone", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Client type
              <select
                disabled={!canManage}
                value={(config.client_type as string) ?? "individual"}
                onChange={(e) => setField("client_type", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink capitalize focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                {CLIENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
              Matches an existing client by email or phone before creating a new one. New clients start as a lead.
            </p>
          </>
        )}

        {actionType === "create_quote" && (
          <>
            <MergeableField label="Title" fieldKey="title" config={config} setField={setField} canManage={canManage} placeholder="Quote" />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Service
              <select
                disabled={!canManage}
                value={(config.service_id as string) ?? ""}
                onChange={(e) => setField("service_id", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="">No specific service</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Total amount ($)
              <input
                disabled={!canManage}
                type="number"
                min={0}
                step="0.01"
                value={(config.total_amount as string) ?? ""}
                onChange={(e) => setField("total_amount", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <MergeableField as="textarea" label="Notes" fieldKey="notes" config={config} setField={setField} canManage={canManage} />
          </>
        )}

        {actionType === "send_quote" && (
          <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
            Sends the client&apos;s most recent draft quote. Only works on a run with a client that has a draft quote.
          </p>
        )}

        {(actionType === "add_tag" || actionType === "remove_tag") && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Tag
            <TagNameInput
              disabled={!canManage}
              value={(config.tag as string) ?? ""}
              onChange={(v) => setField("tag", v)}
              tagOptions={tagOptions}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
          </label>
        )}

        {actionType === "add_note" && (
          <MergeableField as="textarea" label="Note" fieldKey="body" config={config} setField={setField} canManage={canManage} rows={3} />
        )}

        {actionType === "send_portal_message" && (
          <>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Subject (optional)
              <input
                disabled={!canManage}
                value={(config.subject as string) ?? ""}
                onChange={(e) => setField("subject", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <MergeableField as="textarea" label="Message" fieldKey="body" config={config} setField={setField} canManage={canManage} rows={3} />
          </>
        )}

        {actionType === "start_workflow" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Workflow to start
            <select
              disabled={!canManage}
              value={(config.automation_id as string) ?? ""}
              onChange={(e) => setField("automation_id", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="" disabled>
                Choose a workflow
              </option>
              {automationOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {actionType === "end_workflow" && (
          <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
            Stops this workflow here -- no further steps will run for this trigger.
          </p>
        )}

        {actionType === "webhook" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Webhook URL
            <input
              disabled={!canManage}
              type="url"
              value={(config.url as string) ?? ""}
              onChange={(e) => setField("url", e.target.value)}
              placeholder="https://hooks.zapier.com/..."
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
            <span className="mt-1 text-[11px] normal-case text-muted">
              Sends a JSON payload with the same fields available to email/SMS merge fields (client name, engagement number,
              firm name, and so on), plus the data that started this run.
            </span>
          </label>
        )}
      </div>

      {actionType !== "condition" && (
        <div className="mt-3 rounded-lg border border-border bg-surfaceMuted px-3 py-2.5">
          <label className="flex items-center gap-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={requiresApproval}
              onChange={(e) => {
                setRequiresApproval(e.target.checked);
                setSaved(false);
              }}
              className="h-3.5 w-3.5 rounded border-border"
            />
            <ShieldCheck size={14} className="text-muted" />
            Require approval before this step runs
          </label>
          {requiresApproval && (
            <label className="mt-2 flex flex-col gap-1 text-xs text-muted">
              Approver role (leave blank for any workspace admin)
              <select
                disabled={!canManage}
                value={approverRoleId}
                onChange={(e) => {
                  setApproverRoleId(e.target.value);
                  setSaved(false);
                }}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                <option value="">Any workspace admin</option>
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {canManage && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => save()} disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60">
            {saving ? "Saving..." : "Save step"}
          </button>
          {saved && !error && <span className="text-xs text-success">Saved.</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex w-full items-center gap-1.5 text-left text-sm font-semibold text-ink"
      >
        {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
        {title}
        {typeof count === "number" && <span className="font-normal text-muted">({count})</span>}
      </button>
      {open && children}
    </div>
  );
}

export function WorkflowBuilder({
  workspaceId,
  automationId,
  triggerType,
  triggerConfig,
  isEnabled,
  steps,
  stepEdges,
  runs,
  logs,
  emailTemplates,
  smsTemplates,
  canManage,
  organizerTemplates,
  engagementLetterTemplates,
  documentRequestTemplates,
  services = [],
  serviceCategories = [],
  pipelines = [],
  staffOptions = [],
  automationOptions = [],
  tagOptions = [],
  roleOptions = [],
  pendingApprovals = [],
  conditions: initialConditions = [],
  webhookToken,
}: {
  workspaceId: string;
  automationId: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  isEnabled: boolean;
  steps: WorkflowStepRow[];
  stepEdges: WorkflowStepEdgeRow[];
  runs: WorkflowRunRow[];
  logs: WorkflowLogRow[];
  emailTemplates: MessageTemplateOption[];
  smsTemplates: MessageTemplateOption[];
  canManage: boolean;
  organizerTemplates: TemplateOption[];
  engagementLetterTemplates: TemplateOption[];
  documentRequestTemplates: TemplateOption[];
  services?: TemplateOption[];
  serviceCategories?: TemplateOption[];
  pipelines?: PipelineOption[];
  staffOptions?: StaffOption[];
  automationOptions?: AutomationOption[];
  tagOptions?: string[];
  roleOptions?: RoleOption[];
  pendingApprovals?: PendingApprovalRow[];
  conditions?: Condition[] | ConditionGroup[];
  webhookToken?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [currentTriggerType, setCurrentTriggerType] = useState(triggerType);
  const [config, setConfig] = useState<Record<string, unknown>>(triggerConfig);
  const [enabled, setEnabled] = useState(isEnabled);
  const [conditions, setConditions] = useState<ConditionGroup[]>(() => normalizeToConditionGroups(initialConditions));
  const [savingTrigger, setSavingTrigger] = useState(false);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  async function saveTrigger() {
    const tagsToConfirm = new Set(collectClientTagValues(conditions.flatMap((g) => g.conditions)));
    if (currentTriggerType === "client.tag_added") {
      const triggerTag = (config.tag as string | undefined)?.trim();
      if (triggerTag) tagsToConfirm.add(triggerTag);
    }
    for (const tag of tagsToConfirm) {
      if (!(await ensureTagConfirmed(supabase, workspaceId, tag))) return;
    }

    setSavingTrigger(true);
    const { error } = await supabase
      .from("automations")
      .update({ trigger_type: currentTriggerType, trigger_config: config as never, conditions: conditions as never })
      .eq("id", automationId);
    setSavingTrigger(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Trigger saved", "success");
    router.refresh();
  }

  async function toggleEnabled() {
    const next = !enabled;
    // Only turning ON needs a check -- pausing an already-broken workflow
    // is always safe. Same gate as the workflow list's own toggle, so a
    // workflow can't go live from this page without it either.
    if (next) {
      const { data: issues, error: validationError } = await supabase.rpc("validate_automation", { p_automation_id: automationId });
      if (validationError) {
        toast.show(validationError.message, "error");
        return;
      }
      if (issues && issues.length > 0) {
        const lines = issues.map((i) => (i.step_order > 0 ? `Step ${i.step_order} (${i.display_name}): ${i.issue}` : i.issue));
        window.alert(`Can't activate this workflow yet -- fix these first:\n\n${lines.map((l) => `- ${l}`).join("\n")}`);
        return;
      }
    }
    setEnabled(next);
    const { error } = await supabase.from("automations").update({ is_enabled: next }).eq("id", automationId);
    if (error) {
      setEnabled(!next);
      toast.show(error.message, "error");
      return;
    }
    toast.show(next ? "Workflow activated" : "Workflow paused", "success");
    router.refresh();
  }

  async function approvePendingStep(pendingStepId: string) {
    const { error } = await supabase.rpc("approve_automation_step", { p_pending_step_id: pendingStepId });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Approved -- the workflow will continue", "success");
    router.refresh();
  }

  async function rejectPendingStep(pendingStepId: string) {
    const reason = window.prompt("Reason for rejecting this step (optional):") ?? "";
    const { error } = await supabase.rpc("reject_automation_step", { p_pending_step_id: pendingStepId, p_reason: reason.trim() });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Rejected -- the workflow was cancelled", "success");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Steps</h3>
          <button
            type="button"
            onClick={() => setActivityOpen(true)}
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <History size={14} /> Activity{runs.length > 0 ? ` (${runs.length})` : ""}
            {pendingApprovals.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        </div>
        {steps.length === 0 && !canManage ? (
          <EmptyState message="No steps yet -- add one to decide what happens when this workflow fires." />
        ) : (
          <WorkflowCanvas
            workspaceId={workspaceId}
            automationId={automationId}
            steps={steps}
            edges={stepEdges}
            runs={runs}
            canManage={canManage}
            triggerType={currentTriggerType}
            triggerConfig={config}
            emailTemplates={emailTemplates}
            smsTemplates={smsTemplates}
            organizerTemplates={organizerTemplates}
            engagementLetterTemplates={engagementLetterTemplates}
            documentRequestTemplates={documentRequestTemplates}
            services={services}
            serviceCategories={serviceCategories}
            pipelines={pipelines}
            staffOptions={staffOptions}
            automationOptions={automationOptions}
            tagOptions={tagOptions}
            roleOptions={roleOptions}
            onEditTrigger={() => setTriggerModalOpen(true)}
            onOpenRun={(runId) => setOpenRunId(runId)}
          />
        )}
      </div>

      {triggerModalOpen && (
        <div role="dialog" aria-modal="true" aria-label="Edit trigger" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Trigger</h2>
              <div className="flex items-center gap-2">
                {canManage && (
                  <button
                    type="button"
                    onClick={toggleEnabled}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium ${enabled ? "border-success text-success" : "border-border text-muted"}`}
                  >
                    {enabled ? "Active -- click to pause" : "Paused -- click to activate"}
                  </button>
                )}
                <button type="button" onClick={() => setTriggerModalOpen(false)} aria-label="Close" className="text-muted hover:text-ink">
                  <X size={16} />
                </button>
              </div>
            </div>
            <TriggerFields
              triggerType={currentTriggerType}
              onTriggerTypeChange={setCurrentTriggerType}
              config={config}
              onConfigChange={setConfig}
              organizerTemplates={organizerTemplates}
              services={services}
              pipelines={pipelines}
              tagOptions={tagOptions}
              webhookUrl={webhookToken && typeof window !== "undefined" ? `${window.location.origin}/api/automations/webhook/${webhookToken}` : undefined}
              disabled={!canManage}
            />

            <div className="mt-4 border-t border-border pt-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Only run when</h4>
              <ConditionGroupsEditor
                groups={conditions}
                onChange={setConditions}
                staffOptions={staffOptions}
                services={services}
                serviceCategories={serviceCategories}
                pipelines={pipelines}
                organizerTemplates={organizerTemplates}
                tagOptions={tagOptions}
                disabled={!canManage}
              />
            </div>

            {canManage && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    await saveTrigger();
                    setTriggerModalOpen(false);
                  }}
                  disabled={savingTrigger}
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {savingTrigger ? "Saving..." : "Save trigger"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activityOpen && (
        <div role="dialog" aria-modal="true" aria-label="Activity" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Activity</h2>
              <button type="button" onClick={() => setActivityOpen(false)} aria-label="Close" className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>

            {pendingApprovals.length > 0 && (
              <div className="mb-6">
                <CollapsibleSection title="Awaiting approval" count={pendingApprovals.length}>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
                    {pendingApprovals.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div>
                          <p className="font-medium text-ink">
                            {p.step_display_name || p.action_type.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted">
                            {p.client_name ?? p.engagement_number ?? "--"} &middot; waiting since {new Date(p.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => approvePendingStep(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-success/30 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/10"
                          >
                            <ShieldCheck size={13} /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectPendingStep(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-danger/30 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                          >
                            <ShieldX size={13} /> Reject
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              </div>
            )}

            <CollapsibleSection title="Runs" count={runs.length}>
              {runs.length === 0 ? (
                <EmptyState message="This workflow hasn't fired yet." />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                        <th className="px-4 py-2 font-medium">Engagement / client</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Started</th>
                        <th className="px-4 py-2 font-medium">Completed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {runs.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() => setOpenRunId(r.id)}
                          className="cursor-pointer transition-colors hover:bg-surfaceMuted"
                        >
                          <td className="px-4 py-2 font-medium text-ink">{r.client_name ?? r.engagement_number ?? "--"}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${
                                r.status === "running" ? "text-accent" : r.status === "failed" ? "text-danger" : r.status === "completed" ? "text-success" : "text-muted"
                              }`}
                            >
                              {r.status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate">{new Date(r.started_at).toLocaleString()}</td>
                          <td className="px-4 py-2 text-slate">{r.completed_at ? new Date(r.completed_at).toLocaleString() : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-border bg-surfaceMuted px-4 py-2 text-[11px] text-muted">
                    Click a run to see its step-by-step execution log.
                  </p>
                </div>
              )}
            </CollapsibleSection>

            {logs.length > 0 && (
              <div className="mt-6">
                <CollapsibleSection title="Other step executions" count={logs.length}>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
                    {logs.map((l) => {
                      const data = (l.execution_data ?? {}) as { action_type?: string };
                      return (
                        <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2">
                          <span className="text-slate">{data.action_type ?? "step"}</span>
                          <span className={`text-xs font-medium ${l.status === "completed" ? "text-success" : "text-danger"}`}>
                            {l.status}
                            {l.error_message ? `: ${l.error_message}` : ""}
                          </span>
                          <span className="text-xs text-muted">{l.executed_at ? new Date(l.executed_at).toLocaleString() : ""}</span>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleSection>
              </div>
            )}
          </div>
        </div>
      )}

      {openRunId && <RunDetailPanel runId={openRunId} onClose={() => setOpenRunId(null)} />}
    </div>
  );
}
