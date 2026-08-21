"use client";

import { useState } from "react";
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
  GitBranch,
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
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { TriggerFields, triggerSummary, type TemplateOption, type PipelineOption } from "@/components/workflows/TriggerFields";
import { ConditionsEditor, type Condition } from "@/components/workflows/ConditionsEditor";
import { TemplateEditRow } from "@/components/settings/TemplateEditRow";
import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { ensureTagConfirmed, collectClientTagValues } from "@/lib/ensureTag";

export type StaffOption = { id: string; display_name: string | null };
export type AutomationOption = { id: string; name: string };

export type WorkflowStepRow = {
  id: string;
  display_order: number;
  action_type: string;
  action_config: Record<string, unknown>;
  delay_minutes: number;
  canvas_x: number | null;
  canvas_y: number | null;
};

export type WorkflowStepEdgeRow = {
  id: string;
  from_step_id: string;
  to_step_id: string | null;
  branch_conditions: Condition[] | null;
  label: string | null;
  sort_order: number;
};

export type WorkflowRunRow = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
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

export const ACTION_TYPES = [
  { value: "delay", label: "Wait / Delay" },
  { value: "send_email", label: "Send an email" },
  { value: "send_sms", label: "Send a text" },
  { value: "create_task", label: "Create a task" },
  { value: "send_organizer_template", label: "Push an organizer to the client's portal" },
  { value: "create_engagement", label: "Create the engagement and start its pipeline" },
  { value: "send_engagement_letter", label: "Send the engagement letter for signature" },
  { value: "change_stage", label: "Advance to the next pipeline stage" },
  { value: "send_document_request", label: "Send a document request" },
  { value: "assign_user", label: "Assign staff" },
  { value: "send_notification", label: "Notify a staff member" },
  { value: "move_lead_stage", label: "Move the lead to a pipeline stage" },
  { value: "mark_lead_lost", label: "Mark the lead lost" },
  { value: "convert_lead_to_client", label: "Convert the lead to an active client" },
  { value: "update_client", label: "Update a client field" },
  { value: "create_client", label: "Create a new client" },
  { value: "move_engagement_stage", label: "Move the engagement to a pipeline stage" },
  { value: "create_quote", label: "Create a quote" },
  { value: "send_quote", label: "Send the draft quote" },
  { value: "add_tag", label: "Add a tag to the client" },
  { value: "remove_tag", label: "Remove a tag from the client" },
  { value: "invite_to_portal", label: "Invite client to portal (skips if already invited)" },
  { value: "add_note", label: "Add an internal note" },
  { value: "send_portal_message", label: "Send a portal message" },
  { value: "start_workflow", label: "Start another workflow" },
  { value: "end_workflow", label: "End this workflow" },
];

const TASK_PRIORITIES = ["low", "medium", "high"];
const NOTIFICATION_PRIORITIES = ["Low", "Medium", "High"];
const UPDATE_CLIENT_FIELDS = [
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "primary_phone", label: "Phone" },
  { value: "relationship_manager_id", label: "Relationship manager" },
];
const CLIENT_TYPES = ["individual", "business", "trust", "estate", "organization"];

export function actionIcon(type: string) {
  if (type === "delay") return <Clock size={15} />;
  if (type === "send_email") return <Mail size={15} />;
  if (type === "send_sms") return <MessageSquare size={15} />;
  if (type === "send_organizer_template") return <BookOpen size={15} />;
  if (type === "create_engagement") return <Workflow size={15} />;
  if (type === "send_engagement_letter") return <FileSignature size={15} />;
  if (type === "change_stage") return <ArrowRightCircle size={15} />;
  if (type === "send_document_request") return <FolderInput size={15} />;
  if (type === "assign_user") return <UserCog size={15} />;
  if (type === "send_notification") return <Bell size={15} />;
  if (type === "move_lead_stage") return <GitBranch size={15} />;
  if (type === "mark_lead_lost") return <UserX size={15} />;
  if (type === "convert_lead_to_client") return <UserCheck size={15} />;
  if (type === "update_client") return <Pencil size={15} />;
  if (type === "create_client") return <UserPlus size={15} />;
  if (type === "move_engagement_stage") return <Route size={15} />;
  if (type === "create_quote") return <DollarSign size={15} />;
  if (type === "send_quote") return <Send size={15} />;
  if (type === "add_tag" || type === "remove_tag") return <Tag size={15} />;
  if (type === "invite_to_portal") return <LogIn size={15} />;
  if (type === "add_note") return <StickyNote size={15} />;
  if (type === "send_portal_message") return <MessageCircle size={15} />;
  if (type === "start_workflow") return <PlayCircle size={15} />;
  if (type === "end_workflow") return <StopCircle size={15} />;
  return <CheckSquare size={15} />;
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
  pipelines,
  staffOptions,
  automationOptions,
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
  pipelines: PipelineOption[];
  staffOptions: StaffOption[];
  automationOptions: AutomationOption[];
  canManage: boolean;
  onSaved: () => void;
  hideReorder?: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [actionType, setActionType] = useState(step.action_type);
  const [config, setConfig] = useState<Record<string, unknown>>(step.action_config ?? {});
  const [delayUnit, setDelayUnit] = useState<"minutes" | "days">(step.action_config?.delay_unit === "days" ? "days" : "minutes");
  const [delayValue, setDelayValue] = useState(() => {
    const mins = step.delay_minutes ?? 0;
    return delayUnit === "days" ? String(mins / 1440) : String(mins);
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<{
    kind: "email" | "sms";
    row: { id: string; name: string; status: string; workspace_id: string | null; subject?: string | null; body_html?: string | null; body?: string | null };
  } | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  async function openTemplateEditor(kind: "email" | "sms") {
    const slug = config.template_slug as string | undefined;
    if (!slug) return;
    setLoadingTemplate(true);
    const table = kind === "email" ? "email_templates" : "sms_templates";
    const { data, error: fetchError } = await supabase
      .from(table)
      .select("id, name, status, workspace_id, subject, body_html, body")
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

  async function save() {
    if (actionType === "add_tag" || actionType === "remove_tag") {
      const tag = (config.tag as string | undefined)?.trim();
      if (tag && !(await ensureTagConfirmed(supabase, workspaceId, tag))) return;
    }

    setSaving(true);
    setError(null);
    const isDelay = actionType === "delay";
    const delayMinutes = isDelay ? Math.round(delayUnit === "days" ? (parseFloat(delayValue) || 0) * 1440 : parseFloat(delayValue) || 0) : 0;
    const { error: updateError } = await supabase
      .from("automation_steps")
      .update({
        action_type: actionType,
        action_config: (isDelay ? { ...config, delay_unit: delayUnit } : config) as never,
        delay_minutes: delayMinutes,
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

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Action
          <select
            disabled={!canManage}
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              setConfig({});
              setSaved(false);
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            {ACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {actionType === "delay" && (
          <label className="flex flex-col gap-1 text-xs text-muted">
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
              Wire this step&apos;s connections on the diagram to control what it waits before or after -- drag its top handle from
              the step that should finish first, and its bottom handle to whichever step should run once the wait is over.
            </span>
          </label>
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
                {emailTemplates.map((t) => (
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
            </div>
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
                {smsTemplates.map((t) => (
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
            </div>
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
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Task title
              <input
                disabled={!canManage}
                value={(config.title as string) ?? ""}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Automated task"
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Description
              <textarea
                disabled={!canManage}
                rows={2}
                value={(config.description as string) ?? ""}
                onChange={(e) => setField("description", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
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
          </>
        )}

        {actionType === "send_organizer_template" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Organizer
            <select
              disabled={!canManage}
              value={(config.organizer_template_id as string) ?? ""}
              onChange={(e) => setField("organizer_template_id", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="">Auto-detect from the service selected</option>
              {organizerTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">
              Auto-detect sends whichever organizer is linked to the service that triggered this run (set per
              service under Services) -- pick a specific template instead only if this step should always send the
              same organizer regardless of service.
            </span>
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
            <select
              disabled={!canManage}
              value={(config.engagement_letter_template_id as string) ?? ""}
              onChange={(e) => setField("engagement_letter_template_id", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="" disabled>
                Choose an engagement letter template
              </option>
              {engagementLetterTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
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
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Title
              <input
                disabled={!canManage}
                value={(config.title as string) ?? ""}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Requested documents"
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
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
          </>
        )}

        {actionType === "send_notification" && (
          <>
            <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
              Notifies the workspace owner and every active staff member -- no need to pick one person.
            </p>
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
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Message
              <textarea
                disabled={!canManage}
                rows={2}
                value={(config.message as string) ?? ""}
                onChange={(e) => setField("message", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
          </>
        )}

        {actionType === "move_lead_stage" && (
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
              Moves the lead forward to this stage, completing every stage in between. If the lead isn&apos;t already in a pipeline, it
              starts one. Moving backward isn&apos;t supported.
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
            ) : (
              <label className="flex flex-col gap-1 text-xs text-muted">
                New value
                <input
                  disabled={!canManage}
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

        {actionType === "move_engagement_stage" && (
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
              Moves the engagement forward to this stage, completing every stage in between. Moving backward isn&apos;t supported.
            </p>
          </>
        )}

        {actionType === "create_quote" && (
          <>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Title
              <input
                disabled={!canManage}
                value={(config.title as string) ?? ""}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Quote"
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
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
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Notes
              <textarea
                disabled={!canManage}
                rows={2}
                value={(config.notes as string) ?? ""}
                onChange={(e) => setField("notes", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
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
            <input
              disabled={!canManage}
              value={(config.tag as string) ?? ""}
              onChange={(e) => setField("tag", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
          </label>
        )}

        {actionType === "add_note" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Note
            <textarea
              disabled={!canManage}
              rows={3}
              value={(config.body as string) ?? ""}
              onChange={(e) => setField("body", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
          </label>
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
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Message
              <textarea
                disabled={!canManage}
                rows={3}
                value={(config.body as string) ?? ""}
                onChange={(e) => setField("body", e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
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
      </div>

      {canManage && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60">
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
  conditions: initialConditions = [],
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
  conditions?: Condition[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [currentTriggerType, setCurrentTriggerType] = useState(triggerType);
  const [config, setConfig] = useState<Record<string, unknown>>(triggerConfig);
  const [enabled, setEnabled] = useState(isEnabled);
  const [conditions, setConditions] = useState<Condition[]>(initialConditions);
  const [savingTrigger, setSavingTrigger] = useState(false);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);

  async function saveTrigger() {
    const tagsToConfirm = new Set(collectClientTagValues(conditions));
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Steps</h3>
        {steps.length === 0 && !canManage ? (
          <EmptyState message="No steps yet -- add one to decide what happens when this workflow fires." />
        ) : (
          <WorkflowCanvas
            workspaceId={workspaceId}
            automationId={automationId}
            steps={steps}
            edges={stepEdges}
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
            onEditTrigger={() => setTriggerModalOpen(true)}
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
              disabled={!canManage}
            />

            <div className="mt-4 border-t border-border pt-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Only run when</h4>
              <ConditionsEditor
                conditions={conditions}
                onChange={setConditions}
                staffOptions={staffOptions}
                services={services}
                serviceCategories={serviceCategories}
                pipelines={pipelines}
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

      <CollapsibleSection title="Recent runs" count={runs.length}>
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
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-slate">{r.engagement_number ?? r.client_name ?? "--"}</td>
                    <td className="px-4 py-2 capitalize text-slate">{r.status}</td>
                    <td className="px-4 py-2 text-slate">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate">{r.completed_at ? new Date(r.completed_at).toLocaleString() : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {logs.length > 0 && (
        <CollapsibleSection title="Execution log" count={logs.length}>
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
      )}
    </div>
  );
}
