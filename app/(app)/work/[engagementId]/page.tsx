"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Plus,
  Send,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import StatusPill from "@/components/StatusPill";
import type { EngagementWorkspace, PipelineStage, Task } from "@/lib/types";
import { isOpenTaskStatus, statusLabel } from "@/lib/status";

import { friendlyError } from "@/lib/friendlyError";
const TABS = [
  "overview",
  "workflow",
  "requests",
  "forms",
  "documents",
  "messages",
  "billing",
  "notes",
  "settings",
] as const;
type Tab = (typeof TABS)[number];

export default function ServiceWorkspacePage() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();

  const [tab, setTab] = useState<Tab>("overview");
  const [row, setRow] = useState<EngagementWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Map<string, string>>(new Map());

  const [tasks, setTasks] = useState<Task[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [statutoryDeadline, setStatutoryDeadline] = useState<any | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId || !engagementId) return;
    setLoading(true);
    setError(null);
    const { data: engRow, error: engError } = await supabase
      .from("v_engagement_workspace")
      .select("*")
      .eq("engagement_id", engagementId)
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();
    if (engError) {
      setError(engError.message);
      setLoading(false);
      return;
    }
    if (!engRow) {
      setError("Service Workspace not found, or you don't have access to it.");
      setLoading(false);
      return;
    }
    setRow(engRow as EngagementWorkspace);

    const [membersRes, tasksRes, requirementsRes, requestsRes, formsRes, documentsRes, threadsRes, invoicesRes, notesRes, deadlineRes] =
      await Promise.all([
        supabase.from("workspace_members").select("user_id, display_name").eq("workspace_id", activeWorkspaceId),
        supabase.from("tasks").select("*").eq("engagement_id", engagementId).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("engagement_requirements").select("*").eq("engagement_id", engagementId).order("sort_order"),
        supabase.from("client_requests").select("*").eq("engagement_id", engagementId).order("created_at", { ascending: false }),
        supabase
          .from("client_form_assignments")
          .select("*, form_templates(template_name)")
          .eq("engagement_id", engagementId)
          .order("created_at", { ascending: false }),
        supabase.from("documents").select("*").eq("engagement_id", engagementId).order("created_at", { ascending: false }),
        supabase.from("secure_message_threads").select("*").eq("engagement_id", engagementId).order("last_message_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("engagement_id", engagementId).order("created_at", { ascending: false }),
        supabase.from("notes").select("*").eq("engagement_id", engagementId).order("created_at", { ascending: false }),
        supabase
          .from("deadlines")
          .select("*")
          .eq("engagement_id", engagementId)
          .ilike("deadline_type", "%statut%")
          .order("due_date", { ascending: true })
          .limit(1),
      ]);

    const memberMap = new Map<string, string>();
    (membersRes.data ?? []).forEach((m: any) => memberMap.set(m.user_id, m.display_name || "Team member"));
    setMembers(memberMap);
    setTasks((tasksRes.data as Task[]) ?? []);
    setRequirements(requirementsRes.data ?? []);
    setRequests(requestsRes.data ?? []);
    setForms(formsRes.data ?? []);
    setDocuments(documentsRes.data ?? []);
    setThreads(threadsRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);
    setNotes(notesRes.data ?? []);
    setStatutoryDeadline((deadlineRes.data ?? [])[0] ?? null);

    if (engRow.pipeline_id) {
      const { data: stageData } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", engRow.pipeline_id)
        .order("sort_order");
      setStages((stageData as PipelineStage[]) ?? []);
    } else {
      setStages([]);
    }

    setLoading(false);
  }, [activeWorkspaceId, engagementId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeThread) {
      setThreadMessages([]);
      return;
    }
    supabase
      .from("secure_messages")
      .select("*")
      .eq("thread_id", activeThread)
      .order("created_at", { ascending: true })
      .then(({ data }) => setThreadMessages(data ?? []));
  }, [activeThread]);

  const memberLabel = (id: string | null) => (id ? members.get(id) ?? "Unassigned" : "Unassigned");

  const assignedTeam = useMemo(() => {
    if (!row) return [] as string[];
    const ids = new Set<string>();
    if (row.assigned_to) ids.add(row.assigned_to);
    tasks.forEach((t) => t.assigned_to && ids.add(t.assigned_to));
    return Array.from(ids).map((id) => memberLabel(id));
  }, [row, tasks, members]);

  const billingStatus = useMemo(() => {
    if (!row) return "—";
    if (row.open_invoices > 0) return "Invoice outstanding";
    if (row.invoiced_total > 0 && row.paid_total >= row.invoiced_total) return "Paid in full";
    if (row.invoiced_total === 0) return "Not yet invoiced";
    return "Partially paid";
  }, [row]);

  const riskReasons = useMemo(() => {
    if (!row) return [] as string[];
    const reasons: string[] = [];
    if (row.missing_documents > 0) reasons.push(`${row.missing_documents} document(s) missing`);
    if (row.open_forms > 0) reasons.push(`${row.open_forms} form(s) pending`);
    if (row.unmet_requirements > 0) reasons.push(`${row.unmet_requirements} unmet requirement(s)`);
    if (!row.current_stage_ready) reasons.push("Current stage requirements not ready");
    return reasons;
  }, [row]);

  async function toggleTask(t: Task) {
    if (t.task_status === "Completed") return;
    const { error } = await supabase.rpc("complete_task", {
      p_workspace_id: activeWorkspaceId,
      p_task_id: t.id,
    });
    if (!error) void load();
  }

  async function addTask(title: string) {
    if (!title.trim() || !row) return;
    const { data, error } = await supabase.rpc("save_task", {
      p_workspace_id: activeWorkspaceId,
      p_client_id: row.account_id,
      p_service_id: null,
      p_task_title: title.trim(),
      p_task_status: "To Do",
      p_priority: "Normal",
    });
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    // save_task has no engagement_id parameter yet — link the created task
    // to this Service Workspace directly, same table + policy the RPC uses.
    const taskId = (data as any)?.task_id;
    if (taskId) {
      await supabase.from("tasks").update({ engagement_id: engagementId }).eq("id", taskId);
    }
    void load();
  }

  async function addNote() {
    if (!noteDraft.trim() || !row) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("notes").insert({
      workspace_id: activeWorkspaceId,
      client_id: row.account_id,
      engagement_id: engagementId,
      note_body: noteDraft.trim(),
      created_by: userData.user?.id,
    });
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    setNoteDraft("");
    void load();
  }

  async function sendMessage() {
    if (!draft.trim() || !activeThread || !row) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("secure_messages").insert({
      workspace_id: activeWorkspaceId,
      thread_id: activeThread,
      client_id: row.account_id,
      sender_user_id: userData.user?.id,
      sender_type: "Firm",
      message_body: draft.trim(),
      is_internal_note: false,
    });
    if (!error) {
      setDraft("");
      const { data } = await supabase
        .from("secure_messages")
        .select("*")
        .eq("thread_id", activeThread)
        .order("created_at", { ascending: true });
      setThreadMessages(data ?? []);
    }
  }

  async function saveSettings(fields: Partial<{ status: string; priority: string; due_date: string | null; assigned_to: string | null }>) {
    if (!row) return;
    const { error } = await supabase
      .from("engagements")
      .update(fields)
      .eq("id", engagementId)
      .eq("workspace_id", activeWorkspaceId);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    void load();
  }

  if (loading) return <div className="text-sm text-muted">Loading Service Workspace…</div>;
  if (error || !row)
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? "Not found."}
      </div>
    );

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/work")}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Work
      </button>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link href={`/clients/${row.account_id}`} className="font-slab text-xl font-bold text-ink hover:underline">
                {row.account_name}
              </Link>
              <span className="text-muted">—</span>
              <span className="text-lg font-semibold text-ink">{row.engagement_name}</span>
            </div>
            <div className="mt-1 text-xs text-muted">
              {row.tax_year ? `Tax year ${row.tax_year}` : null}
              {row.period_start && row.period_end ? ` · ${row.period_start} – ${row.period_end}` : ""}
            </div>
          </div>
          {riskReasons.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <AlertTriangle size={13} /> At risk
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Internal status">
            <StatusPill status={statusLabel("engagement", row.status, "staff")} />
          </Field>
          <Field label="Client-facing status">
            <span className="text-sm text-ink">{statusLabel("engagement", row.status, "client")}</span>
          </Field>
          <Field label="Progress">
            <span className="text-sm text-ink">
              {row.current_stage_ready ? "Ready for next stage" : "Blocked on current stage"}
            </span>
          </Field>
          <Field label="Next action">
            <span className="text-sm text-ink">
              {riskReasons[0] ?? (row.open_tasks > 0 ? "Open tasks" : "No action needed")}
            </span>
          </Field>
          <Field label="Next-action owner">
            <span className="text-sm text-ink">{memberLabel(row.assigned_to)}</span>
          </Field>
          <Field label="Next-action deadline">
            <span className="text-sm text-ink tabular-nums">{row.due_date ?? "Not set"}</span>
          </Field>
          <Field label="Internal due date">
            <span className="text-sm text-ink tabular-nums">{row.due_date ?? "Not set"}</span>
          </Field>
          <Field label="Statutory due date">
            <span className="text-sm text-ink tabular-nums">{statutoryDeadline?.due_date ?? "Not set"}</span>
          </Field>
          <Field label="Assigned team">
            <span className="text-sm text-ink">{assignedTeam.length ? assignedTeam.join(", ") : "Unassigned"}</span>
          </Field>
          <Field label="Billing status">
            <span className="text-sm text-ink">{billingStatus}</span>
          </Field>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold capitalize ${
              tab === t ? "border-[#108A64] text-[#108A64]" : "border-transparent text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="app-card p-5">
            <h2 className="font-bold text-ink">Open tasks</h2>
            <div className="mt-3 divide-y divide-line">
              {tasks.filter((t) => isOpenTaskStatus(t.task_status)).length === 0 && (
                <Empty text="No open tasks." />
              )}
              {tasks
                .filter((t) => isOpenTaskStatus(t.task_status))
                .map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-ink">{t.task_title}</span>
                    <span className="text-xs text-muted tabular-nums">{t.due_date ?? "—"}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="app-card p-5">
            <h2 className="font-bold text-ink">Snapshot</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <SnapshotRow label="Missing documents" value={row.missing_documents} />
              <SnapshotRow label="Open forms" value={row.open_forms} />
              <SnapshotRow label="Open organizers" value={row.open_organizers} />
              <SnapshotRow label="Open invoices" value={row.open_invoices} />
              <SnapshotRow label="Unmet stage requirements" value={row.unmet_requirements} />
            </dl>
          </div>
        </div>
      )}

      {tab === "workflow" && (
        <div className="space-y-4">
          {stages.length > 0 && (
            <div className="app-card p-5">
              <h2 className="font-bold text-ink mb-3">Stage</h2>
              <div className="flex flex-wrap gap-2">
                {stages.map((s) => (
                  <span
                    key={s.id}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      s.id === row.pipeline_stage_id
                        ? "bg-[#108A64] text-white"
                        : "bg-paper text-muted"
                    }`}
                  >
                    {s.stage_name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="app-card p-5">
            <h2 className="font-bold text-ink mb-3">Stage requirements</h2>
            {requirements.length === 0 && <Empty text="No requirements defined for this stage." />}
            <div className="divide-y divide-line">
              {requirements.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 py-2.5">
                  {r.is_satisfied ? (
                    <CheckCircle2 size={16} className="text-[#108A64]" />
                  ) : (
                    <Circle size={16} className="text-muted" />
                  )}
                  <span className="text-sm text-ink">{r.title}</span>
                  {r.is_required && !r.is_satisfied && (
                    <span className="text-[10px] font-semibold uppercase text-amber-700">Required</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="app-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-ink">Tasks</h2>
              <NewTaskInline onAdd={addTask} />
            </div>
            <div className="divide-y divide-line">
              {tasks.length === 0 && <Empty text="No tasks yet." />}
              {tasks.map((t) => (
                <label key={t.id} className="flex items-center gap-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={t.task_status === "Completed"}
                    onChange={() => toggleTask(t)}
                    className="h-4 w-4 accent-[#108A64]"
                  />
                  <span
                    className="flex-1 text-sm text-ink"
                    style={{ textDecoration: t.task_status === "Completed" ? "line-through" : "none", opacity: t.task_status === "Completed" ? 0.5 : 1 }}
                  >
                    {t.task_title}
                  </span>
                  <span className="text-xs text-muted tabular-nums">{t.due_date ?? "—"}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "requests" && (
        <div className="app-card divide-y divide-line">
          {requests.length === 0 && <Empty text="No client requests on this Service Workspace yet." />}
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-ink text-sm">{r.title}</div>
                <div className="text-xs text-muted mt-0.5">{r.request_type}</div>
              </div>
              <StatusPill status={r.request_status} />
            </div>
          ))}
        </div>
      )}

      {tab === "forms" && (
        <div className="app-card divide-y divide-line">
          {forms.length === 0 && <Empty text="No forms assigned to this Service Workspace yet." />}
          {forms.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-ink text-sm">{f.form_templates?.template_name ?? "Form"}</div>
                <div className="text-xs text-muted mt-0.5">Due {f.due_date ?? "—"}</div>
              </div>
              <StatusPill status={f.assignment_status} />
            </div>
          ))}
        </div>
      )}

      {tab === "documents" && (
        <div className="app-card divide-y divide-line">
          {documents.length === 0 && <Empty text="No documents on this Service Workspace yet." />}
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-ink text-sm">{d.document_name}</div>
                <div className="text-xs text-muted mt-0.5">{d.document_category}</div>
              </div>
              <StatusPill status={d.document_status} />
            </div>
          ))}
        </div>
      )}

      {tab === "messages" && (
        <div className="app-card grid gap-0 sm:grid-cols-[220px_1fr] overflow-hidden">
          <div className="border-b border-line sm:border-b-0 sm:border-r">
            {threads.length === 0 && <div className="p-4 text-xs text-muted">No message threads yet.</div>}
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThread(t.id)}
                className={`block w-full px-4 py-3 text-left text-sm ${activeThread === t.id ? "bg-paper font-semibold" : ""}`}
              >
                {t.subject || "Conversation"}
              </button>
            ))}
          </div>
          <div className="flex min-h-[220px] flex-col p-4">
            {!activeThread ? (
              <Empty text="Select a thread to view messages." />
            ) : (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {threadMessages.map((m) => (
                    <div key={m.id} className="rounded-lg bg-paper px-3 py-2 text-sm text-ink">
                      {m.message_body}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Reply…"
                    className="flex-1 rounded-xl border border-line px-3 py-2 text-sm"
                  />
                  <button onClick={sendMessage} className="grid h-10 w-10 place-items-center rounded-xl bg-[#108A64] text-white">
                    <Send size={15} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "billing" && (
        <div className="app-card divide-y divide-line">
          {invoices.length === 0 && <Empty text="No invoices on this Service Workspace yet." />}
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-ink text-sm">{inv.invoice_number || "Invoice"}</div>
                <div className="text-xs text-muted mt-0.5">
                  ${Number(inv.total_amount ?? 0).toFixed(2)} · Due {inv.due_date ?? "—"}
                </div>
              </div>
              <StatusPill status={inv.invoice_status} />
            </div>
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div className="app-card p-5">
          <div className="flex gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add an internal note…"
              className="flex-1 rounded-xl border border-line px-3 py-2 text-sm"
            />
            <button
              onClick={addNote}
              className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="mt-4 divide-y divide-line">
            {notes.length === 0 && <Empty text="No notes yet." />}
            {notes.map((n) => (
              <div key={n.id} className="py-3">
                <p className="text-sm text-ink">{n.note_body}</p>
                <div className="mt-1 text-[11px] text-muted">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="app-card max-w-md p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted">Status</label>
            <select
              defaultValue={row.status}
              onBlur={(e) => saveSettings({ status: e.target.value })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            >
              {["active", "completed", "cancelled"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">Priority</label>
            <select
              defaultValue={row.priority ?? "Normal"}
              onBlur={(e) => saveSettings({ priority: e.target.value })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            >
              {["Low", "Normal", "High", "Urgent"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">Due date</label>
            <input
              type="date"
              defaultValue={row.due_date ?? ""}
              onBlur={(e) => saveSettings({ due_date: e.target.value || null })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">Assigned to</label>
            <select
              defaultValue={row.assigned_to ?? ""}
              onBlur={(e) => saveSettings({ assigned_to: e.target.value || null })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {Array.from(members.entries()).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${value > 0 ? "text-amber-700" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">{text}</div>;
}

function NewTaskInline({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(value);
        setValue("");
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New task…"
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs"
      />
      <button type="submit" className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-paper">
        Add
      </button>
    </form>
  );
}
