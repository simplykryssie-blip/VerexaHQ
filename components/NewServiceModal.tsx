"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Pipeline, PipelineStage, Service } from "@/lib/types";

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
    supabase
      .from("workspace_members")
      .select("user_id, display_name, role")
      .eq("workspace_id", resolvedWorkspaceId)
      .eq("member_status", "Active")
      .then(({ data }) =>
        setMembers(((data as any[]) ?? []).map((m) => ({ user_id: m.user_id, label: m.display_name || m.role || "Team member" })))
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
        setError(error.message);
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
      setError(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!service) return;
    if (!window.confirm(`Delete service "${service.service_type}"? This can't be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("services").delete().eq("id", service.id);
    setDeleting(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted?.();
    onClose();
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
            <input
              placeholder="Status (e.g. New, In Progress, Filed)"
              value={serviceStatus}
              onChange={(e) => setServiceStatus(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
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
                onClick={handleDelete}
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
