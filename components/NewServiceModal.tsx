"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Pipeline, PipelineStage, Service } from "@/lib/types";
import { listActiveStaff } from "@/lib/workspaceMembers";

import { friendlyError } from "@/lib/friendlyError";
const SERVICE_STATUSES = [
  "New",
  "Pending Documents",
  "Ready to Start",
  "In Progress",
  "Waiting on Client",
  "Review",
  "Completed",
  "On Hold",
  "Canceled",
];

export default function NewServiceModal({
  clientId,
  service,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId?: string;
  service?: Service;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!service;
  const [clients, setClients] = useState<Client[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(service?.client_id ?? clientId ?? "");
  const [serviceType, setServiceType] = useState(service?.service_type ?? "");
  const [serviceStatus, setServiceStatus] = useState(service?.service_status ?? "New");
  const [serviceYear, setServiceYear] = useState(service?.service_year ?? new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState(service?.start_date ?? "");
  const [dueDate, setDueDate] = useState(service?.due_date ?? "");
  const [assignedTo, setAssignedTo] = useState(service?.assigned_to ?? "");
  const [members, setMembers] = useState<{ user_id: string; label: string }[]>([]);
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState(service?.workspace_id ?? "");
  const [pipelineId, setPipelineId] = useState(service?.pipeline_id ?? "");
  const [stageId, setStageId] = useState(service?.pipeline_stage_id ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real counts for the delete confirmation — deleting a service used to
  // just remove the `services` row directly, leaving its engagement and
  // every generated task/deadline/document/form-assignment behind as
  // orphaned data (confirmed live: those FKs are all ON DELETE SET NULL,
  // never CASCADE). Deletion now goes through delete_service_with_workflow,
  // a transactional RPC that removes all of it together — this just shows
  // staff what that RPC is actually about to remove before they confirm.
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [workflowCounts, setWorkflowCounts] = useState<{ tasks: number; deadlines: number; documents: number; forms: number } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!service) return;
    supabase
      .from("engagements")
      .select("id")
      .eq("service_id", service.id)
      .maybeSingle()
      .then(({ data }) => {
        const engId = (data as { id: string } | null)?.id ?? null;
        setEngagementId(engId);
        if (!engId) {
          setWorkflowCounts(null);
          return;
        }
        const match = `service_id.eq.${service.id},engagement_id.eq.${engId}`;
        Promise.all([
          supabase.from("tasks").select("id", { count: "exact", head: true }).or(match),
          supabase.from("deadlines").select("id", { count: "exact", head: true }).or(match),
          supabase.from("documents").select("id", { count: "exact", head: true }).or(match),
          supabase.from("client_form_assignments").select("id", { count: "exact", head: true }).or(match),
        ]).then(([t, d, doc, f]) => {
          setWorkflowCounts({ tasks: t.count ?? 0, deadlines: d.count ?? 0, documents: doc.count ?? 0, forms: f.count ?? 0 });
        });
      });
  }, [service?.id]);

  useEffect(() => {
    if (!clientId) {
      supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .order("first_name")
        .then(({ data }) => setClients((data as Client[]) ?? []));
    }
    supabase
      .from("pipelines")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => setPipelines((data as Pipeline[]) ?? []));
  }, [clientId]);

  // Needed to populate the "Assigned to" dropdown from the right workspace.
  // When editing, service.workspace_id is already known; when creating,
  // it's resolved from whichever client is currently selected.
  useEffect(() => {
    if (service?.workspace_id) {
      setResolvedWorkspaceId(service.workspace_id);
      return;
    }
    if (!selectedClientId) {
      setResolvedWorkspaceId("");
      return;
    }
    supabase
      .from("clients")
      .select("workspace_id")
      .eq("id", selectedClientId)
      .maybeSingle()
      .then(({ data }) => setResolvedWorkspaceId((data as { workspace_id: string } | null)?.workspace_id ?? ""));
  }, [service?.workspace_id, selectedClientId]);

  useEffect(() => {
    if (!resolvedWorkspaceId) {
      setMembers([]);
      return;
    }
    listActiveStaff(resolvedWorkspaceId).then((staff) =>
      setMembers(staff.map((s) => ({ user_id: s.userId, label: s.name })))
    );
  }, [resolvedWorkspaceId]);

  useEffect(() => {
    if (!pipelineId) {
      setStages([]);
      return;
    }
    supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        const list = (data as PipelineStage[]) ?? [];
        setStages(list);
        if (!list.find((s) => s.id === stageId)) {
          setStageId(list[0]?.id ?? "");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) {
      setError("Choose a client for this service.");
      return;
    }
    setSaving(true);
    setError(null);

    if (isEditing) {
      // Same row, always — this only ever updates service!.id, never
      // inserts, so editing can't create a duplicate service.
      const { error } = await supabase
        .from("services")
        .update({
          service_type: serviceType,
          service_status: serviceStatus,
          service_year: serviceYear || null,
          start_date: startDate || null,
          due_date: dueDate || null,
          assigned_to: assignedTo || null,
          pipeline_id: pipelineId || null,
          pipeline_stage_id: stageId || null,
        })
        .eq("id", service!.id);
      setSaving(false);
      if (error) {
        setError(friendlyError(error, "Something went wrong. Please try again."));
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { data: client } = await supabase
      .from("clients")
      .select("workspace_id")
      .eq("id", selectedClientId)
      .maybeSingle();

    if (!client) {
      setError("Could not find that client's workspace.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("services").insert({
      workspace_id: client.workspace_id,
      client_id: selectedClientId,
      service_type: serviceType,
      service_status: "New",
      service_year: serviceYear || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      pipeline_id: pipelineId || null,
      pipeline_stage_id: stageId || null,
    });

    setSaving(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onSaved();
    onClose();
  }

  function requestDelete() {
    setDeleteError(null);
    setConfirmingDelete(true);
  }

  // delete_service_with_workflow (SECURITY DEFINER, permission-checked)
  // atomically removes the service, its engagement, and every generated
  // task/deadline/document/form-assignment/checklist-item together, or
  // refuses with a clear message if the service has retained financial/
  // filed/audited records — see its migration for exactly what's checked.
  async function confirmDelete() {
    if (!service) return;
    setDeleting(true);
    setDeleteError(null);
    const { error: rpcError } = await supabase.rpc("delete_service_with_workflow", { p_service_id: service.id });
    setDeleting(false);
    if (rpcError) {
      setDeleteError(friendlyError(rpcError, "Something went wrong deleting this service. Please try again."));
      return;
    }
    onDeleted?.();
    onClose();
  }

  if (confirmingDelete) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4 py-8">
        <div className="bg-white rounded-sm border border-line w-full max-w-md max-h-full overflow-y-auto p-6">
          <h3 className="font-slab text-lg font-bold text-ink mb-4">Delete this service?</h3>
          {engagementId ? (
            <div className="space-y-3 text-sm text-ink">
              <p className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900">
                Deleting this service will also delete its Service Workspace and related workflow items.
              </p>
              {workflowCounts ? (
                <ul className="space-y-1 text-xs text-muted">
                  <li>{workflowCounts.tasks} task{workflowCounts.tasks === 1 ? "" : "s"}</li>
                  <li>{workflowCounts.deadlines} deadline{workflowCounts.deadlines === 1 ? "" : "s"}</li>
                  <li>{workflowCounts.documents} document request{workflowCounts.documents === 1 ? "" : "s"}</li>
                  <li>{workflowCounts.forms} form assignment{workflowCounts.forms === 1 ? "" : "s"}</li>
                </ul>
              ) : (
                <p className="text-xs text-muted">Loading what will be removed…</p>
              )}
              <p className="text-xs text-muted">
                This can&apos;t be undone. If this service has invoices, signed documents, filed tax returns, or other
                records that must be preserved, deletion will be blocked — cancel it instead (set its status to
                Canceled) in that case.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink">This service has no workflow attached. Deleting it can&apos;t be undone.</p>
          )}
          {deleteError && (
            <div className="mt-3 text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">{deleteError}</div>
          )}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-brick text-white disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete service and workflow"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-sm border border-line w-full max-w-md max-h-full overflow-y-auto p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Service" : "New Service"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!clientId && !isEditing && (
            <select
              required
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientLabel(c)}
                </option>
              ))}
            </select>
          )}

          <input
            required
            placeholder="Service type (e.g. Bookkeeping, 1120-S, Payroll)"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          {isEditing && (
            <select
              value={serviceStatus}
              onChange={(e) => setServiceStatus(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              {SERVICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <input
            placeholder="Service year"
            value={serviceYear}
            onChange={(e) => setServiceYear(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
          </div>

          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            <option value="">No pipeline</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pipeline_name}
              </option>
            ))}
          </select>

          {stages.length > 0 && (
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.stage_name}
                </option>
              ))}
            </select>
          )}

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={requestDelete}
                disabled={deleting}
                className="text-sm font-semibold py-2 px-3 rounded-sm border border-brick text-brick disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Service"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
