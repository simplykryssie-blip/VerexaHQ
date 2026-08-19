"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Split, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import {
  StepCard,
  actionIcon,
  ACTION_TYPES,
  type WorkflowStepRow,
  type WorkflowStepEdgeRow,
  type MessageTemplateOption,
  type StaffOption,
  type AutomationOption,
} from "@/components/workflows/WorkflowBuilder";
import type { TemplateOption, PipelineOption } from "@/components/workflows/TriggerFields";
import { BranchEditor } from "@/components/workflows/BranchEditor";

type StepNodeData = { step: WorkflowStepRow };

function ActionNode({ data, selected }: NodeProps & { data: StepNodeData }) {
  const { step } = data;
  const actionMeta = ACTION_TYPES.find((a) => a.value === step.action_type);
  return (
    <div
      className={`w-56 rounded-xl border bg-surface px-3 py-2.5 shadow-sm ${selected ? "border-accent ring-2 ring-accent/30" : "border-border"}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted" />
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surfaceMuted text-accent">{actionIcon(step.action_type)}</span>
        <span className="truncate">{actionMeta?.label ?? step.action_type}</span>
      </div>
      {step.delay_minutes > 0 && <p className="mt-1 text-[11px] text-muted">Waits {step.delay_minutes}m before running</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-muted" />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps & { data: StepNodeData & { branchCount: number } }) {
  return (
    <div
      className={`w-48 rounded-xl border bg-violetSoft px-3 py-2.5 shadow-sm ${selected ? "border-accent ring-2 ring-accent/30" : "border-violet/40"}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted" />
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-violet">
          <Split size={14} />
        </span>
        Condition
      </div>
      <p className="mt-1 text-[11px] text-muted">{data.branchCount} branch{data.branchCount === 1 ? "" : "es"}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-muted" />
    </div>
  );
}

const nodeTypes = { action: ActionNode, condition: ConditionNode };

function autoPosition(index: number): { x: number; y: number } {
  return { x: 300, y: 80 + index * 160 };
}

function newNodePosition(count: number): { x: number; y: number } {
  return { x: 80 + (count % 3) * 260, y: 80 + Math.floor(count / 3) * 160 };
}

function CanvasInner({
  automationId,
  steps,
  edges: edgeRows,
  canManage,
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
}: {
  automationId: string;
  steps: WorkflowStepRow[];
  edges: WorkflowStepEdgeRow[];
  canManage: boolean;
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
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const initialNodes: Node[] = useMemo(
    () =>
      steps.map((s, i) => {
        const branchCount = edgeRows.filter((e) => e.from_step_id === s.id).length;
        return {
          id: s.id,
          type: s.action_type === "condition" ? "condition" : "action",
          position: s.canvas_x != null && s.canvas_y != null ? { x: s.canvas_x, y: s.canvas_y } : autoPosition(i),
          data: { step: s, branchCount },
          selected: s.id === selectedStepId,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, edgeRows]
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      edgeRows.map((e) => ({
        id: e.id,
        source: e.from_step_id,
        target: e.to_step_id,
        label: e.label ?? undefined,
        style: e.branch_conditions ? { stroke: "var(--color-accent, #0b7fe0)" } : undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [edgeRows]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges]);

  const onNodeDragStop = useCallback<OnNodeDrag>(
    async (_event, node) => {
      await supabase.from("automation_steps").update({ canvas_x: node.position.x, canvas_y: node.position.y }).eq("id", node.id);
    },
    [supabase]
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    setSelectedStepId(node.id);
  }, []);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        toast.show("A step can't connect to itself.", "error");
        return;
      }
      const sourceStep = steps.find((s) => s.id === connection.source);
      const existingOutgoing = edgeRows.filter((e) => e.from_step_id === connection.source);
      if (sourceStep?.action_type !== "condition" && existingOutgoing.length >= 1) {
        toast.show("This step already has a next step. Only condition steps can branch to more than one.", "error");
        return;
      }
      const sortOrder = existingOutgoing.length;
      const { error } = await supabase.from("automation_step_edges").insert({
        automation_id: automationId,
        from_step_id: connection.source,
        to_step_id: connection.target,
        sort_order: sortOrder,
      } as never);
      if (error) {
        toast.show(error.message, "error");
        return;
      }
      router.refresh();
    },
    [automationId, edgeRows, steps, supabase, toast, router]
  );

  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      for (const e of deleted) {
        await supabase.from("automation_step_edges").delete().eq("id", e.id);
      }
      router.refresh();
    },
    [supabase, router]
  );

  const onNodesDelete = useCallback(
    async (deleted: Node[]) => {
      for (const n of deleted) {
        await supabase.from("automation_steps").delete().eq("id", n.id);
      }
      if (deleted.some((n) => n.id === selectedStepId)) setSelectedStepId(null);
      toast.show(deleted.length === 1 ? "Step removed" : "Steps removed", "success");
      router.refresh();
    },
    [supabase, router, selectedStepId, toast]
  );

  async function addStep(actionType: string) {
    const position = newNodePosition(steps.length);
    const { error } = await supabase.from("automation_steps").insert({
      automation_id: automationId,
      display_order: steps.length > 0 ? Math.max(...steps.map((s) => s.display_order)) + 1 : 0,
      action_type: actionType,
      action_config: {},
      canvas_x: position.x,
      canvas_y: position.y,
    } as never);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null;
  const selectedStepOutgoingEdges = selectedStep ? edgeRows.filter((e) => e.from_step_id === selectedStep.id) : [];
  const targetLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of steps) {
      const meta = ACTION_TYPES.find((a) => a.value === s.action_type);
      map[s.id] = s.action_type === "condition" ? "Condition" : meta?.label ?? s.action_type;
    }
    return map;
  }, [steps]);

  return (
    <div className="flex h-[600px] overflow-hidden rounded-xl border border-border">
      <div className="relative flex-1">
        {canManage && (
          <div className="absolute left-3 top-3 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => addStep("create_task")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-accent shadow-sm hover:bg-accentSoft"
            >
              <Plus size={14} /> Add action
            </button>
            <button
              type="button"
              onClick={() => addStep("condition")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-violet shadow-sm hover:bg-violetSoft"
            >
              <Split size={14} /> Add condition
            </button>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={canManage ? onNodesChange : undefined}
          onEdgesChange={canManage ? onEdgesChange : undefined}
          onNodeDragStop={canManage ? onNodeDragStop : undefined}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedStepId(null)}
          onConnect={canManage ? onConnect : undefined}
          onNodesDelete={canManage ? onNodesDelete : undefined}
          onEdgesDelete={canManage ? onEdgesDelete : undefined}
          nodeTypes={nodeTypes}
          nodesDraggable={canManage}
          nodesConnectable={canManage}
          elementsSelectable
          fitView
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {selectedStep && (
        <div className="w-96 shrink-0 overflow-y-auto border-l border-border bg-surfaceMuted p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink">{selectedStep.action_type === "condition" ? "Condition" : "Step"}</h4>
            <button type="button" onClick={() => setSelectedStepId(null)} aria-label="Close" className="text-muted hover:text-ink">
              <X size={16} />
            </button>
          </div>
          {selectedStep.action_type === "condition" ? (
            <BranchEditor
              edges={selectedStepOutgoingEdges}
              targetLabels={targetLabels}
              staffOptions={staffOptions}
              services={services}
              serviceCategories={serviceCategories}
              pipelines={pipelines}
              canManage={canManage}
              onSaved={() => router.refresh()}
            />
          ) : (
            <StepCard
              step={selectedStep}
              index={0}
              total={1}
              hideReorder
              emailTemplates={emailTemplates}
              smsTemplates={smsTemplates}
              organizerTemplates={organizerTemplates}
              engagementLetterTemplates={engagementLetterTemplates}
              documentRequestTemplates={documentRequestTemplates}
              services={services}
              pipelines={pipelines}
              staffOptions={staffOptions}
              automationOptions={automationOptions}
              canManage={canManage}
              onSaved={() => router.refresh()}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function WorkflowCanvas(props: Parameters<typeof CanvasInner>[0]) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
