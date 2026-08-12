"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Mail, MessageSquare, Plus, Trash2, CheckSquare, BookOpen, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { TriggerFields, triggerSummary, type TemplateOption } from "@/components/workflows/TriggerFields";

export type WorkflowStepRow = {
  id: string;
  display_order: number;
  action_type: string;
  action_config: Record<string, unknown>;
  delay_minutes: number;
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

type MessageTemplateOption = { id: string; name: string; slug: string };

const ACTION_TYPES = [
  { value: "send_email", label: "Send an email" },
  { value: "send_sms", label: "Send a text" },
  { value: "create_task", label: "Create a task" },
  { value: "send_organizer_template", label: "Push an organizer to the client's portal" },
  { value: "create_engagement", label: "Create the engagement and start its pipeline" },
];

const TASK_PRIORITIES = ["low", "medium", "high"];

function actionIcon(type: string) {
  if (type === "send_email") return <Mail size={15} />;
  if (type === "send_sms") return <MessageSquare size={15} />;
  if (type === "send_organizer_template") return <BookOpen size={15} />;
  if (type === "create_engagement") return <Workflow size={15} />;
  return <CheckSquare size={15} />;
}

function StepCard({
  step,
  index,
  total,
  emailTemplates,
  smsTemplates,
  organizerTemplates,
  canManage,
  onSaved,
}: {
  step: WorkflowStepRow;
  index: number;
  total: number;
  emailTemplates: MessageTemplateOption[];
  smsTemplates: MessageTemplateOption[];
  organizerTemplates: TemplateOption[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [actionType, setActionType] = useState(step.action_type);
  const [config, setConfig] = useState<Record<string, unknown>>(step.action_config ?? {});
  const [delayMinutes, setDelayMinutes] = useState(step.delay_minutes?.toString() ?? "0");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(key: string, value: string) {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("automation_steps")
      .update({
        action_type: actionType,
        action_config: config as never,
        delay_minutes: parseInt(delayMinutes, 10) || 0,
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
    await supabase.rpc("reorder_automation_step", { p_step_id: step.id, p_direction: direction });
    onSaved();
  }

  async function remove() {
    if (!window.confirm("Remove this step?")) return;
    await supabase.from("automation_steps").delete().eq("id", step.id);
    onSaved();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surfaceMuted text-xs text-muted">{index + 1}</span>
          {actionIcon(actionType)}
          Step {index + 1}
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={index === 0} onClick={() => move("up")} className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30" aria-label="Move up">
              <ArrowUp size={14} />
            </button>
            <button type="button" disabled={index === total - 1} onClick={() => move("down")} className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30" aria-label="Move down">
              <ArrowDown size={14} />
            </button>
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
        <label className="flex flex-col gap-1 text-xs text-muted">
          Wait before running (minutes)
          <input
            disabled={!canManage}
            type="number"
            min={0}
            value={delayMinutes}
            onChange={(e) => {
              setDelayMinutes(e.target.value);
              setSaved(false);
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
        </label>

        {actionType === "send_email" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Email template
            <select
              disabled={!canManage}
              value={(config.template_slug as string) ?? ""}
              onChange={(e) => setField("template_slug", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
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
          </label>
        )}

        {actionType === "send_sms" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            SMS template
            <select
              disabled={!canManage}
              value={(config.template_slug as string) ?? ""}
              onChange={(e) => setField("template_slug", e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
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
          </label>
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
              <option value="" disabled>
                Choose an organizer template
              </option>
              {organizerTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {actionType === "create_engagement" && (
          <p className="col-span-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
            Creates an engagement from the service already resolved on the organizer submission that triggered this run, and starts its
            pipeline. Only works when this step follows an &quot;An organizer is submitted&quot; trigger.
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

export function WorkflowBuilder({
  workspaceId,
  automationId,
  triggerType,
  triggerConfig,
  isEnabled,
  steps,
  runs,
  logs,
  emailTemplates,
  smsTemplates,
  canManage,
  organizerTemplates,
  services = [],
}: {
  workspaceId: string;
  automationId: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  isEnabled: boolean;
  steps: WorkflowStepRow[];
  runs: WorkflowRunRow[];
  logs: WorkflowLogRow[];
  emailTemplates: MessageTemplateOption[];
  smsTemplates: MessageTemplateOption[];
  canManage: boolean;
  organizerTemplates: TemplateOption[];
  services?: TemplateOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [currentTriggerType, setCurrentTriggerType] = useState(triggerType);
  const [config, setConfig] = useState<Record<string, unknown>>(triggerConfig);
  const [enabled, setEnabled] = useState(isEnabled);

  async function saveTrigger() {
    await supabase.from("automations").update({ trigger_type: currentTriggerType, trigger_config: config as never }).eq("id", automationId);
    router.refresh();
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    await supabase.from("automations").update({ is_enabled: next }).eq("id", automationId);
    router.refresh();
  }

  async function addStep() {
    const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.display_order)) + 1 : 0;
    await supabase.from("automation_steps").insert({
      automation_id: automationId,
      workspace_id: workspaceId,
      display_order: nextOrder,
      action_type: "create_task",
      action_config: {},
    } as never);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Trigger</h3>
          {canManage && (
            <button
              type="button"
              onClick={toggleEnabled}
              className={`rounded-lg border px-3 py-1 text-xs font-medium ${enabled ? "border-success text-success" : "border-border text-muted"}`}
            >
              {enabled ? "Active -- click to pause" : "Paused -- click to activate"}
            </button>
          )}
        </div>
        <div className="mt-3">
          <TriggerFields
            triggerType={currentTriggerType}
            onTriggerTypeChange={setCurrentTriggerType}
            config={config}
            onConfigChange={setConfig}
            organizerTemplates={organizerTemplates}
            services={services}
            disabled={!canManage}
          />
          {canManage && (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={saveTrigger} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90">
                Save trigger
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Steps</h3>
          {canManage && (
            <button type="button" onClick={addStep} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
              <Plus size={13} /> Add step
            </button>
          )}
        </div>
        {steps.length === 0 ? (
          <EmptyState message="No steps yet -- add one to decide what happens when this workflow fires." />
        ) : (
          <div className="space-y-3">
            {steps.map((s, i) => (
              <StepCard
                key={s.id}
                step={s}
                index={i}
                total={steps.length}
                emailTemplates={emailTemplates}
                smsTemplates={smsTemplates}
                organizerTemplates={organizerTemplates}
                canManage={canManage}
                onSaved={() => router.refresh()}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Recent runs</h3>
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
      </div>

      {logs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Execution log</h3>
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
        </div>
      )}
    </div>
  );
}
