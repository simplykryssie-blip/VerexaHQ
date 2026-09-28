"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Kanban, Settings, Waypoints } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";

export type KanbanStage = { id: string; name: string; display_order: number };

export type KanbanCard = {
  runId: string;
  entityType: "client" | "engagement";
  entityId: string;
  processStageId: string;
  title: string;
  subtitle: string | null;
  badge: { label: string; tone: "success" | "warning" | "danger" | "neutral" | "accent" } | null;
  /** Always the client workspace -- an engagement card opens its client, who
   *  can then drill into the engagement itself (per the IA decision that
   *  Pipelines resolves to clients, not a third workspace). */
  href: string;
};

export function PipelineKanbanClient({
  pipelines,
  selectedProcessId,
  stages,
  cards: initialCards,
  canManagePipelines,
  canMoveClients,
  canMoveEngagements,
  canCreateClients,
  canCreateEngagements,
}: {
  pipelines: { id: string; name: string; status: string }[];
  selectedProcessId: string | null;
  stages: KanbanStage[];
  cards: KanbanCard[];
  canManagePipelines: boolean;
  canMoveClients: boolean;
  canMoveEngagements: boolean;
  canCreateClients: boolean;
  canCreateEngagements: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [cards, setCards] = useState(initialCards);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const orderByStageId = new Map(stages.map((s, i) => [s.id, i]));

  function canMove(entityType: "client" | "engagement") {
    return entityType === "client" ? canMoveClients : canMoveEngagements;
  }

  async function moveCard(card: KanbanCard, targetStageId: string) {
    if (!selectedProcessId || targetStageId === card.processStageId) return;
    const targetOrder = orderByStageId.get(targetStageId);
    const currentOrder = orderByStageId.get(card.processStageId);
    if (targetOrder !== undefined && currentOrder !== undefined && targetOrder < currentOrder) {
      toast.show("Moving backward through pipeline stages isn't supported.", "error");
      return;
    }

    const previousStageId = card.processStageId;
    setMovingId(card.runId);
    setCards((prev) => prev.map((c) => (c.runId === card.runId ? { ...c, processStageId: targetStageId } : c)));

    const { error } = await supabase.rpc("advance_pipeline_stage", {
      p_entity_type: card.entityType,
      p_entity_id: card.entityId,
      p_process_id: selectedProcessId,
      p_process_stage_id: targetStageId,
    });

    setMovingId(null);
    if (error) {
      setCards((prev) => prev.map((c) => (c.runId === card.runId ? { ...c, processStageId: previousStageId } : c)));
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  function switchPipeline(processId: string) {
    router.push(`/pipelines?process=${processId}`);
  }

  return (
    <>
      <PageHero
        icon={Kanban}
        tone="accent"
        heading={
          <>
            Your <HeroHighlight>pipelines</HeroHighlight>.
          </>
        }
        subtitle="The work actually moving through your firm right now, one card per client or engagement, grouped by stage."
        actions={
          <Link href="/pipelines/manage" className={buttonClasses("secondary", "sm")}>
            <Settings size={14} /> Manage Pipelines
          </Link>
        }
      />
      <div className="flex-1 space-y-4 px-8 py-6">
        {pipelines.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState
              icon={Waypoints}
              message="No pipelines yet."
              action={
                canManagePipelines ? (
                  <Link href="/pipelines/manage" className={buttonClasses("primary", "sm")}>
                    Create a pipeline
                  </Link>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="pipeline-select" className="text-xs font-medium uppercase tracking-wide text-muted">
                  Pipeline
                </label>
                <select
                  id="pipeline-select"
                  value={selectedProcessId ?? ""}
                  onChange={(e) => switchPipeline(e.target.value)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.status === "draft" ? " (draft)" : ""}
                    </option>
                  ))}
                </select>
                {selectedProcessId && (
                  <Link href={`/pipelines/${selectedProcessId}`} className="text-xs font-medium text-muted hover:text-accent hover:underline">
                    Edit stages
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canCreateEngagements && selectedProcessId && (
                  <Link href={`/engagements/new?processId=${selectedProcessId}`} className={buttonClasses("secondary", "sm")}>
                    + New Engagement
                  </Link>
                )}
                {canCreateClients && (
                  <Link href="/clients" className={buttonClasses("primary", "sm")}>
                    + New Client
                  </Link>
                )}
              </div>
            </div>

            {stages.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface shadow-soft">
                <EmptyState message="This pipeline has no stages yet -- add some from Manage Pipelines." />
              </div>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                  {stages.map((stage) => {
                    const items = cards.filter((c) => c.processStageId === stage.id);
                    return (
                      <div
                        key={stage.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverStageId(stage.id);
                        }}
                        onDragLeave={() => setDragOverStageId((s) => (s === stage.id ? null : s))}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverStageId(null);
                          const runId = e.dataTransfer.getData("text/plain");
                          const card = cards.find((c) => c.runId === runId);
                          if (card && canMove(card.entityType)) void moveCard(card, stage.id);
                        }}
                        className={`flex w-72 shrink-0 flex-col rounded-xl border bg-surfaceMuted transition ${
                          dragOverStageId === stage.id ? "border-accent ring-2 ring-accent/30" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{stage.name}</h3>
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">{items.length}</span>
                        </div>
                        <div className="flex-1 space-y-2 px-2 pb-2" style={{ minHeight: "60px" }}>
                          {items.map((card) => {
                            const draggable = canMove(card.entityType);
                            return (
                              <div
                                key={card.runId}
                                draggable={draggable}
                                onDragStart={(ev) => {
                                  if (!draggable) return;
                                  ev.dataTransfer.setData("text/plain", card.runId);
                                  ev.dataTransfer.effectAllowed = "move";
                                  setDraggingId(card.runId);
                                }}
                                onDragEnd={() => setDraggingId(null)}
                                className={`rounded-lg border border-border bg-surface p-3 shadow-soft transition hover:shadow-softHover ${
                                  draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                                } ${draggingId === card.runId || movingId === card.runId ? "opacity-40" : ""}`}
                              >
                                <Link href={card.href} className="text-sm font-medium text-accent hover:underline">
                                  {card.title}
                                </Link>
                                {card.subtitle && <p className="mt-0.5 truncate text-sm text-slate">{card.subtitle}</p>}
                                {card.badge && (
                                  <div className="mt-2">
                                    <Badge tone={card.badge.tone}>{card.badge.label}</Badge>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
