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
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Split, Trash2, X, Zap } from "lucide-react";
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
import { triggerSummary, type TemplateOption, type PipelineOption } from "@/components/workflows/TriggerFields";
import { BranchEditor } from "@/components/workflows/BranchEditor";

type StepNodeData = { step: WorkflowStepRow };

// React Flow's default handle hit-target is a tiny ~6px dot -- easy to miss
// entirely on a trackpad, especially once the canvas is zoomed to fit
// several nodes. Every handle in this file uses this larger, easier-to-grab
// style instead of the library default.
const handleStyle = { width: 14, height: 14, borderWidth: 2 };

function ActionNode({ data, selected }: NodeProps & { data: StepNodeData }) {
  const { step } = data;
  const actionMeta = ACTION_TYPES.find((a) => a.value === step.action_type);
  return (
    <div
      className={`w-56 rounded-xl border bg-surface px-3 py-2.5 shadow-sm ${selected ? "border-accent ring-2 ring-accent/30" : "border-border"}`}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-muted" />
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surfaceMuted text-accent">{actionIcon(step.action_type)}</span>
        <span className="truncate">{actionMeta?.label ?? step.action_type}</span>
      </div>
      {step.delay_minutes > 0 && <p className="mt-1 text-[11px] text-muted">Waits {step.delay_minutes}m before running</p>}
      <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-muted" />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps & { data: StepNodeData & { branchCount: number } }) {
  return (
    <div
      className={`w-48 rounded-xl border bg-violetSoft px-3 py-2.5 shadow-sm ${selected ? "border-accent ring-2 ring-accent/30" : "border-violet/40"}`}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-muted" />
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-violet">
          <Split size={14} />
        </span>
        Condition
      </div>
      <p className="mt-1 text-[11px] text-muted">{data.branchCount} branch{data.branchCount === 1 ? "" : "es"}</p>
      <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-muted" />
    </div>
  );
}

function TriggerNode({ data }: NodeProps & { data: { summary: string } }) {
  return (
    <div className="w-56 rounded-xl border border-amber bg-amberSoft px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-amber">
          <Zap size={14} />
        </span>
        Trigger
      </div>
      <p className="mt-1 text-[11px] text-muted">{data.summary}</p>
      <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-muted" isConnectable={false} />
    </div>
  );
}

const nodeTypes = { action: ActionNode, condition: ConditionNode, trigger: TriggerNode };
const TRIGGER_NODE_ID = "__trigger__";

function autoPosition(index: number): { x: number; y: number } {
  return { x: 300, y: 140 + index * 160 };
}

function newNodePosition(count: number): { x: number; y: number } {
  return { x: 80 + (count % 3) * 260, y: 140 + Math.floor(count / 3) * 160 };
}

function CanvasInner({
  automationId,
  steps,
  edges: edgeRows,
  canManage,
  triggerType,
  triggerConfig,
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
  triggerType: string;
  triggerConfig: Record<string, unknown>;
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const rootStepIds = useMemo(() => {
    const hasIncoming = new Set(edgeRows.map((e) => e.to_step_id));
    return steps.filter((s) => !hasIncoming.has(s.id)).map((s) => s.id);
  }, [steps, edgeRows]);

  const initialNodes: Node[] = useMemo(() => {
    const stepNodes = steps.map((s, i) => {
      const branchCount = edgeRows.filter((e) => e.from_step_id === s.id).length;
      return {
        id: s.id,
        type: s.action_type === "condition" ? "condition" : "action",
        position: s.canvas_x != null && s.canvas_y != null ? { x: s.canvas_x, y: s.canvas_y } : autoPosition(i),
        data: { step: s, branchCount },
      };
    });
    const triggerNode: Node = {
      id: TRIGGER_NODE_ID,
      type: "trigger",
      position: { x: 300, y: -20 },
      data: { summary: triggerSummary(triggerType, triggerConfig, organizerTemplates, services, pipelines) },
      draggable: false,
      selectable: false,
    };
    return [triggerNode, ...stepNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, edgeRows, triggerType, triggerConfig]);

  const initialEdges: Edge[] = useMemo(() => {
    const realEdges = edgeRows.map((e) => ({
      id: e.id,
      source: e.from_step_id,
      target: e.to_step_id,
      label: e.label ?? undefined,
      style: e.branch_conditions ? { stroke: "var(--color-accent, #0b7fe0)" } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    // Visual only, not a real automation_step_edges row -- shows where
    // execution actually starts (the step(s) with no incoming edge).
    const triggerEdges = rootStepIds.map((id) => ({
      id: `${TRIGGER_NODE_ID}-${id}`,
      source: TRIGGER_NODE_ID,
      target: id,
      style: { strokeDasharray: "4 3" },
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    return [...triggerEdges, ...realEdges];
  }, [edgeRows, rootStepIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges]);

  const onNodeDragStop = useCallback<OnNodeDrag>(
    async (_event, node) => {
      if (node.id === TRIGGER_NODE_ID) return;
      await supabase.from("automation_steps").update({ canvas_x: node.position.x, canvas_y: node.position.y }).eq("id", node.id);
    },
    [supabase]
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    if (node.id === TRIGGER_NODE_ID) return;
    setSelectedEdgeId(null);
    setSelectedStepId(node.id);
  }, []);

  const onEdgeClick = useCallback<EdgeMouseHandler>((_event, edge) => {
    if (edge.id.startsWith(TRIGGER_NODE_ID)) return;
    setSelectedStepId(null);
    setSelectedEdgeId(edge.id);
  }, []);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === TRIGGER_NODE_ID || connection.target === TRIGGER_NODE_ID) return;
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
      // Reflect the connection immediately -- don't make the user wait on a
      // round trip to see whether the drag "worked."
      setEdges((eds) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
      const { error } = await supabase.from("automation_step_edges").insert({
        automation_id: automationId,
        from_step_id: connection.source,
        to_step_id: connection.target,
        sort_order: sortOrder,
      } as never);
      if (error) {
        toast.show(error.message, "error");
        router.refresh();
        return;
      }
      router.refresh();
    },
    [automationId, edgeRows, steps, supabase, toast, router, setEdges]
  );

  async function deleteEdge(edgeId: string) {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setSelectedEdgeId(null);
    const { error } = await supabase.from("automation_step_edges").delete().eq("id", edgeId);
    if (error) {
      toast.show(error.message, "error");
    }
    router.refresh();
  }

  async function deleteStep(stepId: string) {
    if (!window.confirm("Remove this step? Any connections to or from it will be removed too.")) return;
    setNodes((nds) => nds.filter((n) => n.id !== stepId));
    setEdges((eds) => eds.filter((e) => e.source !== stepId && e.target !== stepId));
    setSelectedStepId(null);
    const { error } = await supabase.from("automation_steps").delete().eq("id", stepId);
    if (error) {
      toast.show(error.message, "error");
    } else {
      toast.show("Step removed", "success");
    }
    router.refresh();
  }

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
  const selectedEdge = selectedEdgeId ? edgeRows.find((e) => e.id === selectedEdgeId) : null;
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
          onEdgeClick={onEdgeClick}
          onPaneClick={() => {
            setSelectedStepId(null);
            setSelectedEdgeId(null);
          }}
          onConnect={canManage ? onConnect : undefined}
          nodeTypes={nodeTypes}
          nodesDraggable={canManage}
          nodesConnectable={canManage}
          connectionRadius={40}
          elementsSelectable
          fitView
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {(selectedStep || selectedEdge) && (
        <div className="w-96 shrink-0 overflow-y-auto border-l border-border bg-surfaceMuted p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink">
              {selectedEdge ? "Connection" : selectedStep?.action_type === "condition" ? "Condition" : "Step"}
            </h4>
            <button
              type="button"
              onClick={() => {
                setSelectedStepId(null);
                setSelectedEdgeId(null);
              }}
              aria-label="Close"
              className="text-muted hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          {selectedEdge ? (
            <div className="space-y-3">
              <p className="text-sm text-slate">
                {targetLabels[selectedEdge.from_step_id] ?? "Step"} &rarr; {targetLabels[selectedEdge.to_step_id] ?? "Step"}
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => deleteEdge(selectedEdge.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                >
                  <Trash2 size={14} /> Delete this connection
                </button>
              )}
            </div>
          ) : selectedStep?.action_type === "condition" ? (
            <div className="space-y-3">
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
              {canManage && (
                <button
                  type="button"
                  onClick={() => deleteStep(selectedStep.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                >
                  <Trash2 size={14} /> Delete this condition
                </button>
              )}
            </div>
          ) : selectedStep ? (
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
          ) : null}
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
