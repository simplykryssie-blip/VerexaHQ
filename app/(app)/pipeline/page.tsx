"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Pipeline, PipelineStage, Service, Client } from "@/lib/types";
import NewPipelineModal from "@/components/NewPipelineModal";
import NewServiceModal from "@/components/NewServiceModal";

type ServiceWithClient = Service & { clientName: string };

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [services, setServices] = useState<ServiceWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<ServiceWithClient | null>(null);

  async function loadPipelines() {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .eq("is_active", true)
      .order("created_at");
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const list = (data as Pipeline[]) ?? [];
    setPipelines(list);
    if (list.length > 0) setActivePipelineId(list[0].id);
    else setLoading(false);
  }

  useEffect(() => {
    loadPipelines();
  }, []);

  async function loadBoard() {
    if (!activePipelineId) return;
    setLoading(true);
    const [stagesRes, servicesRes] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", activePipelineId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("services").select("*").eq("pipeline_id", activePipelineId),
    ]);

    if (stagesRes.error || servicesRes.error) {
      setError(stagesRes.error?.message || servicesRes.error?.message || "Load failed");
      setLoading(false);
      return;
    }

    const svcList = (servicesRes.data as Service[]) ?? [];
    const clientIds = Array.from(new Set(svcList.map((s) => s.client_id)));
    let clientsMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .in("id", clientIds);
      (clientsData as Client[] | null)?.forEach((c) => {
        const name =
          c.client_type === "business" && c.business_name
            ? c.business_name
            : `${c.first_name} ${c.last_name}`.trim();
        clientsMap.set(c.id, name);
      });
    }

    setStages((stagesRes.data as PipelineStage[]) ?? []);
    setServices(
      svcList.map((s) => ({ ...s, clientName: clientsMap.get(s.client_id) ?? "Unknown client" }))
    );
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    loadBoard();
  }, [activePipelineId]);

  const servicesByStage = useMemo(() => {
    const map = new Map<string, ServiceWithClient[]>();
    for (const svc of services) {
      const key = svc.pipeline_stage_id ?? "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(svc);
    }
    return map;
  }, [services]);

  async function moveService(service: ServiceWithClient, direction: 1 | -1) {
    const currentIndex = stages.findIndex((s) => s.id === service.pipeline_stage_id);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= stages.length) return;
    const nextStage = stages[nextIndex];
    await moveServiceToStage(service, nextStage.id);
  }

  async function moveServiceToStage(service: ServiceWithClient, stageId: string) {
    if (service.pipeline_stage_id === stageId) return;
    const { error } = await supabase
      .from("services")
      .update({ pipeline_stage_id: stageId })
      .eq("id", service.id);

    if (!error) {
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, pipeline_stage_id: stageId } : s))
      );
    }
  }

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Engagement Pipeline
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Pipeline</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pipelines.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePipelineId(p.id)}
              className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
              style={{
                borderColor: activePipelineId === p.id ? "#0D1B2A" : "#DDE3EC",
                backgroundColor: activePipelineId === p.id ? "#0D1B2A" : "white",
                color: activePipelineId === p.id ? "white" : "#0D1B2A",
              }}
            >
              {p.pipeline_name}
            </button>
          ))}
          <button
            onClick={() => setShowPipelineModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Pipeline
          </button>
          {pipelines.length > 0 && (
            <button
              onClick={() => setShowServiceModal(true)}
              className="flex items-center gap-1.5 bg-ink text-white text-xs font-semibold px-3 py-1.5 rounded-sm hover:bg-[#14273A] transition-colors"
            >
              <Plus size={13} /> Service
            </button>
          )}
        </div>
      </div>

      {showPipelineModal && (
        <NewPipelineModal
          onClose={() => setShowPipelineModal(false)}
          onCreated={loadPipelines}
        />
      )}
      {showServiceModal && (
        <NewServiceModal
          onClose={() => setShowServiceModal(false)}
          onSaved={loadBoard}
        />
      )}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {!loading && pipelines.length === 0 && (
        <div className="text-sm text-muted bg-white border border-line rounded-sm px-5 py-6">
          No pipelines set up yet. Click &quot;+ Pipeline&quot; above to create one with its
          stages right from here.
        </div>
      )}

      {pipelines.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="w-72 shrink-0">
              <div
                className="flex items-center justify-between px-3 py-2 rounded-t-sm border-t border-x border-line"
                style={{ backgroundColor: `${stage.stage_color || "#0D1B2A"}14` }}
              >
                <span className="text-xs font-bold uppercase tracking-wide text-ink">
                  {stage.stage_name}
                </span>
                <span className="text-xs font-mono text-muted">
                  {servicesByStage.get(stage.id)?.length ?? 0}
                </span>
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStageId(stage.id);
                }}
                onDragLeave={() => setDragOverStageId((cur) => (cur === stage.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  const svcId = e.dataTransfer.getData("text/plain");
                  const svc = services.find((s) => s.id === svcId);
                  setDragOverStageId(null);
                  setDraggingId(null);
                  if (svc) moveServiceToStage(svc, stage.id);
                }}
                className="bg-white border border-line rounded-b-sm min-h-[120px] p-2 space-y-2 transition-colors"
                style={{
                  backgroundColor: dragOverStageId === stage.id ? "#F5F7FA" : "white",
                  outline: dragOverStageId === stage.id ? "2px dashed #0D1B2A" : "none",
                  outlineOffset: "-2px",
                }}
              >
                {(servicesByStage.get(stage.id) ?? []).map((svc) => (
                  <div
                    key={svc.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", svc.id);
                      setDraggingId(svc.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStageId(null);
                    }}
                    className="border border-line rounded-sm p-3 bg-paper cursor-grab active:cursor-grabbing"
                    style={{ opacity: draggingId === svc.id ? 0.4 : 1 }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-semibold text-ink">
                        {svc.clientName}
                      </div>
                      <button
                        onClick={() => setEditingService(svc)}
                        className="text-muted hover:text-ink"
                        aria-label="Edit service"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {svc.service_type} · {svc.service_year}
                    </div>
                    <div className="flex justify-between mt-2">
                      <button
                        disabled={idx === 0}
                        onClick={() => moveService(svc, -1)}
                        className="text-[11px] font-semibold text-muted disabled:opacity-30"
                      >
                        ← Back
                      </button>
                      <button
                        disabled={idx === stages.length - 1}
                        onClick={() => moveService(svc, 1)}
                        className="text-[11px] font-semibold text-ink disabled:opacity-30"
                      >
                        Advance →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingService && (
        <NewServiceModal
          service={editingService}
          onClose={() => setEditingService(null)}
          onSaved={loadBoard}
          onDeleted={loadBoard}
        />
      )}
    </div>
  );
}
