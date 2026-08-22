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

type ConditionBranchHandle = { id: string; label: string | null; wired: boolean };

// Every branch gets its own source handle spread evenly along the bottom
// edge, labeled above with the branch's name, so dragging from a specific
// dot unambiguously wires that specific branch -- there's no more guessing
// which of several branches sharing one handle a drag was "for". A
// condition with no branches defined yet (BranchEditor never saved) falls
// back to a single generic handle so it can still be wired up directly from
// the canvas.
function ConditionNode({ data, selected }: NodeProps & { data: StepNodeData & { branches: ConditionBranchHandle[] } }) {
  const branches = data.branches;
  return (
    <div
      className={`w-72 rounded-xl border bg-violetSoft px-3 py-2.5 shadow-sm ${selected ? "border-accent ring-2 ring-accent/30" : "border-violet/40"}`}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-muted" />
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-violet">
          <Split size={14} />
        </span>
        Condition
      </div>
      <p className="mt-1 text-[11px] text-muted">{branches.length} branch{branches.length === 1 ? "" : "es"}</p>
      {branches.length > 0 && (
        // One row per branch (not a side-by-side grid) so each branch's full
        // condition text is legible without hovering -- with 3+ branches
        // sharing a fixed-width node, a grid truncates every label down to
        // just a few characters, making different branches look identical.
        <div className="mt-1.5 flex flex-col gap-1 text-[10px] font-medium text-muted">
          {branches.map((b, i) => (
            <span key={b.id} title={b.label || `Branch ${i + 1}`}>
              <span className="text-violet">{i + 1}.</span> {b.label || `Branch ${i + 1}`}
            </span>
          ))}
        </div>
      )}
      {branches.length === 0 ? (
        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-muted" />
      ) : (
        branches.map((b, i) => (
          <Handle
            key={b.id}
            id={b.id}
            type="source"
            position={Position.Bottom}
            style={{ ...handleStyle, left: `${((i + 0.5) / branches.length) * 100}%` }}
            className={b.wired ? "!bg-muted" : "!bg-amber"}
          />
        ))
      )}
    </div>
  );
}

function TriggerNode({ data }: NodeProps & { data: { summary: string } }) {
  return (
    <div className="w-56 cursor-pointer rounded-xl border border-amber bg-amberSoft px-3 py-2.5 shadow-sm hover:border-amber/70">
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
const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 160;

function autoPosition(index: number): { x: number; y: number } {
  return { x: 300, y: 140 + index * 160 };
}

// A brand-new step with no anchor to attach to (the very first node) lands
// straight below the trigger. One attached to an anchor with no siblings
// yet goes directly below it -- a single chain stays a straight vertical
// line. An anchor that already has other children (a condition's other
// branches) gets its new child placed one column to the right of the
// rightmost existing sibling, so branches spread out horizontally instead
// of stacking on top of each other. Existing nodes are never moved, so a
// manually dragged layout is always respected.
function positionForNewStep(anchor: WorkflowStepRow | null, siblings: WorkflowStepRow[]): { x: number; y: number } {
  if (!anchor) return { x: 300, y: 140 };
  const anchorX = anchor.canvas_x ?? 300;
  const anchorY = anchor.canvas_y ?? 140;
  if (siblings.length === 0) {
    return { x: anchorX, y: anchorY + ROW_HEIGHT };
  }
  const maxSiblingX = Math.max(...siblings.map((s) => s.canvas_x ?? anchorX));
  return { x: maxSiblingX + COLUMN_WIDTH, y: anchorY + ROW_HEIGHT };
}

function CanvasInner({
  workspaceId,
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
  onEditTrigger,
}: {
  workspaceId: string;
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
  onEditTrigger: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeConditionStepId, setActiveConditionStepId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const rootStepIds = useMemo(() => {
    const hasIncoming = new Set(edgeRows.map((e) => e.to_step_id));
    return steps.filter((s) => !hasIncoming.has(s.id)).map((s) => s.id);
  }, [steps, edgeRows]);

  const initialNodes: Node[] = useMemo(() => {
    const stepNodes = steps.map((s, i) => {
      const branches = edgeRows
        .filter((e) => e.from_step_id === s.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => ({ id: e.id, label: e.label, wired: e.to_step_id != null }));
      return {
        id: s.id,
        type: s.action_type === "condition" ? "condition" : "action",
        position: s.canvas_x != null && s.canvas_y != null ? { x: s.canvas_x, y: s.canvas_y } : autoPosition(i),
        data: { step: s, branches },
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
    // A branch with no destination yet (defined via the condition modal,
    // not dragged to a target) has nothing to draw a line to.
    const realEdges = edgeRows
      .filter((e): e is WorkflowStepEdgeRow & { to_step_id: string } => e.to_step_id != null)
      .map((e) => {
        const fromStep = steps.find((s) => s.id === e.from_step_id);
        return {
          id: e.id,
          source: e.from_step_id,
          target: e.to_step_id,
          // Condition nodes expose one handle per branch, keyed by that
          // branch's edge id -- pin each edge to its own handle so it
          // doesn't default to whichever handle React Flow picks first.
          sourceHandle: fromStep?.action_type === "condition" ? e.id : undefined,
          label: e.label ?? undefined,
          style: e.branch_conditions ? { stroke: "var(--color-accent, #0b7fe0)" } : undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
        };
      });
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
  }, [edgeRows, rootStepIds, steps]);

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

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (node.id === TRIGGER_NODE_ID) {
        onEditTrigger();
        return;
      }
      setSelectedEdgeId(null);
      if (node.type === "condition") {
        setSelectedStepId(null);
        setActiveConditionStepId(node.id);
      } else {
        setActiveConditionStepId(null);
        setSelectedStepId(node.id);
      }
    },
    [onEditTrigger]
  );

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
      // A condition node exposes one connection handle per branch, keyed by
      // that branch's edge id -- if the drag started from one of those, it
      // unambiguously identifies which branch to wire up, no guessing.
      const handleBranch = connection.sourceHandle
        ? existingOutgoing.find((e) => e.id === connection.sourceHandle)
        : undefined;
      // Fallback for a condition with no branches predefined yet (only its
      // single generic handle exists then) -- wire up the first unwired
      // branch, same as before per-branch handles existed.
      const targetBranch = handleBranch ?? existingOutgoing.find((e) => e.to_step_id === null);

      if (!targetBranch && sourceStep?.action_type !== "condition" && existingOutgoing.length >= 1) {
        toast.show("This step already has a next step. Only condition steps can branch to more than one.", "error");
        return;
      }
      // Reflect the connection immediately -- don't make the user wait on a
      // round trip to see whether the drag "worked."
      setEdges((eds) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed } }, eds));

      if (targetBranch) {
        // If the handle was already wired (dragging from an already-connected
        // branch to a new target), this rewires that branch rather than
        // piling on a duplicate edge for the same branch.
        const { error } = await supabase.from("automation_step_edges").update({ to_step_id: connection.target }).eq("id", targetBranch.id);
        if (error) toast.show(error.message, "error");
        router.refresh();
        return;
      }

      const { error } = await supabase.from("automation_step_edges").insert({
        automation_id: automationId,
        from_step_id: connection.source,
        to_step_id: connection.target,
        sort_order: existingOutgoing.length,
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
    setActiveConditionStepId(null);
    const { error } = await supabase.from("automation_steps").delete().eq("id", stepId);
    if (error) {
      toast.show(error.message, "error");
    } else {
      toast.show("Step removed", "success");
    }
    router.refresh();
  }

  async function addStep(actionType: string) {
    // Auto-connect to whatever the user has selected, or otherwise to
    // whichever step was added most recently -- so building a workflow is
    // "click Add repeatedly" for a simple chain, not "add a floating box,
    // then separately drag a line to it every single time."
    const anchor =
      (selectedStepId && steps.find((s) => s.id === selectedStepId)) ||
      steps.reduce<WorkflowStepRow | null>((latest, s) => (!latest || s.display_order > latest.display_order ? s : latest), null);
    const anchorOutgoing = anchor ? edgeRows.filter((e) => e.from_step_id === anchor.id) : [];
    const canAutoConnect = Boolean(anchor) && (anchor!.action_type === "condition" || anchorOutgoing.length === 0);
    const siblings = canAutoConnect ? (anchorOutgoing.map((e) => steps.find((s) => s.id === e.to_step_id)).filter(Boolean) as WorkflowStepRow[]) : [];
    const position = positionForNewStep(canAutoConnect ? anchor : null, siblings);

    const { data: newStep, error } = await supabase
      .from("automation_steps")
      .insert({
        automation_id: automationId,
        display_order: steps.length > 0 ? Math.max(...steps.map((s) => s.display_order)) + 1 : 0,
        action_type: actionType,
        action_config: {},
        canvas_x: position.x,
        canvas_y: position.y,
      } as never)
      .select("id")
      .single();
    if (error || !newStep) {
      toast.show(error?.message ?? "Could not add the step", "error");
      return;
    }

    if (canAutoConnect && anchor) {
      // A condition may already have Yes/No (etc.) defined via its branches
      // modal with no destination yet -- wire the first of those up instead
      // of adding a redundant extra edge alongside them.
      const unwiredBranch = anchorOutgoing.find((e) => e.to_step_id === null);
      const { error: edgeError } = unwiredBranch
        ? await supabase.from("automation_step_edges").update({ to_step_id: (newStep as { id: string }).id }).eq("id", unwiredBranch.id)
        : await supabase.from("automation_step_edges").insert({
            automation_id: automationId,
            from_step_id: anchor.id,
            to_step_id: (newStep as { id: string }).id,
            sort_order: anchorOutgoing.length,
          } as never);
      if (edgeError) {
        toast.show(edgeError.message, "error");
      }
    }
    // A condition step needs its branches defined before it means anything --
    // open that editor immediately instead of leaving an unconfigured node
    // on the canvas the user has to remember to come back to.
    if (actionType === "condition") {
      setActiveConditionStepId((newStep as { id: string }).id);
    }
    router.refresh();
  }

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null;
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
          <div className="absolute right-3 top-3 z-10">
            <button
              type="button"
              onClick={() => setAddMenuOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-accent shadow-sm hover:bg-accentSoft"
            >
              <Plus size={14} /> Add step
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false);
                    addStep("create_task");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-accentSoft"
                >
                  <Plus size={14} className="text-accent" /> Regular action
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false);
                    addStep("condition");
                  }}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs font-medium text-ink hover:bg-violetSoft"
                >
                  <Split size={14} className="text-violet" /> Condition (if/else)
                </button>
              </div>
            )}
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
            setAddMenuOpen(false);
          }}
          onConnect={canManage ? onConnect : undefined}
          nodeTypes={nodeTypes}
          nodesDraggable={canManage}
          nodesConnectable={canManage}
          connectionRadius={40}
          elementsSelectable
          fitView
          fitViewOptions={{ maxZoom: 0.85 }}
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
                {targetLabels[selectedEdge.from_step_id] ?? "Step"} &rarr;{" "}
                {(selectedEdge.to_step_id && targetLabels[selectedEdge.to_step_id]) ?? "Step"}
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
          ) : selectedStep ? (
            <StepCard
              workspaceId={workspaceId}
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
              serviceCategories={serviceCategories}
              pipelines={pipelines}
              staffOptions={staffOptions}
              automationOptions={automationOptions}
              canManage={canManage}
              onSaved={() => {
                router.refresh();
                setSelectedStepId(null);
              }}
            />
          ) : null}
        </div>
      )}

      {activeConditionStepId && (
        <div role="dialog" aria-modal="true" aria-label="Edit condition branches" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Condition branches</h2>
              <button type="button" onClick={() => setActiveConditionStepId(null)} aria-label="Close" className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <BranchEditor
              workspaceId={workspaceId}
              stepId={activeConditionStepId}
              automationId={automationId}
              edges={edgeRows.filter((e) => e.from_step_id === activeConditionStepId)}
              targetLabels={targetLabels}
              staffOptions={staffOptions}
              services={services}
              serviceCategories={serviceCategories}
              pipelines={pipelines}
              organizerTemplates={organizerTemplates}
              canManage={canManage}
              onSaved={() => router.refresh()}
              onClose={() => setActiveConditionStepId(null)}
              onDeleteStep={() => deleteStep(activeConditionStepId)}
            />
          </div>
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
