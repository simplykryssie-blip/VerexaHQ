"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
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
  type WorkflowRunRow,
  type MessageTemplateOption,
  type StaffOption,
  type AutomationOption,
} from "@/components/workflows/WorkflowBuilder";
import { triggerSummary, type TemplateOption, type PipelineOption } from "@/components/workflows/TriggerFields";
import { BranchEditor } from "@/components/workflows/BranchEditor";

type StepNodeData = { step: WorkflowStepRow; activeRuns: WorkflowRunRow[]; onOpenRun: (runId: string) => void };

function runInitials(run: WorkflowRunRow) {
  const label = run.client_name ?? run.engagement_number ?? "?";
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2 ? parts[0][0] + parts[1][0] : label.slice(0, 2);
  return initials.toUpperCase();
}

// GHL's "small box that flows with the automation": one avatar chip per
// client currently sitting at this step (status='running', current_step_id
// = this step), floating on the node's corner so it's visible without
// opening anything. A soft pulse marks it as live, not a static count.
// Clicking one opens that specific client's run in RunDetailPanel; a stack
// past 3 collapses into a "+N" chip that opens the most recent of the rest.
function RunTicker({ runs, onOpenRun }: { runs: WorkflowRunRow[]; onOpenRun: (runId: string) => void }) {
  if (runs.length === 0) return null;
  const shown = runs.slice(0, 3);
  const overflow = runs.slice(3);
  return (
    <div className="nodrag absolute -right-2 -top-2.5 z-10 flex items-center" onClick={(e) => e.stopPropagation()}>
      {shown.map((run, i) => (
        <button
          key={run.id}
          type="button"
          title={`${run.client_name ?? run.engagement_number ?? "Client"} -- click to view this run`}
          onClick={() => onOpenRun(run.id)}
          style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}
          className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-accent text-[10px] font-bold text-white shadow-sm hover:scale-110"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />
          <span className="relative">{runInitials(run)}</span>
        </button>
      ))}
      {overflow.length > 0 && (
        <button
          type="button"
          title={`${overflow.length} more client${overflow.length === 1 ? "" : "s"} on this step`}
          onClick={() => onOpenRun(overflow[0].id)}
          style={{ marginLeft: -8, zIndex: 0 }}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-slate text-[9px] font-bold text-white shadow-sm hover:scale-110"
        >
          +{overflow.length}
        </button>
      )}
    </div>
  );
}

// React Flow's default handle hit-target is a tiny ~6px dot -- easy to miss
// entirely on a trackpad, especially once the canvas is zoomed to fit
// several nodes. Every handle in this file uses this larger, easier-to-grab
// style instead of the library default.
const handleStyle = { width: 14, height: 14, borderWidth: 2 };

// Color-codes a step by what KIND of thing it does (not by status), matching
// the app's existing categorical chip palette (Badge/dashboard tiles already
// use emerald/amber/violet/rose this same way) -- so at a glance, without
// reading every label, a wait looks different from a message which looks
// different from a pipeline move. Anything not listed falls back to the
// generic accent "Action" treatment.
const STEP_KIND: Record<string, { label: string; color: string; soft: string }> = {
  delay: { label: "Wait", color: "#F59E0B", soft: "#FEF3DE" },
  business_hours_delay: { label: "Wait", color: "#F59E0B", soft: "#FEF3DE" },
  send_email: { label: "Message", color: "#10B981", soft: "#E3FAF0" },
  send_sms: { label: "Message", color: "#10B981", soft: "#E3FAF0" },
  send_portal_message: { label: "Message", color: "#10B981", soft: "#E3FAF0" },
  send_document_request: { label: "Message", color: "#10B981", soft: "#E3FAF0" },
  send_engagement_letter: { label: "Message", color: "#10B981", soft: "#E3FAF0" },
  send_quote: { label: "Message", color: "#10B981", soft: "#E3FAF0" },
  send_organizer_template: { label: "Message", color: "#10B981", soft: "#E3FAF0" },
  send_notification: { label: "Notify", color: "#FB7185", soft: "#FDECEF" },
  change_stage: { label: "Pipeline", color: "#0B7FE0", soft: "#E8F3FE" },
  move_lead_stage: { label: "Pipeline", color: "#0B7FE0", soft: "#E8F3FE" },
  move_lead_to_service_pipeline: { label: "Pipeline", color: "#0B7FE0", soft: "#E8F3FE" },
  move_engagement_stage: { label: "Pipeline", color: "#0B7FE0", soft: "#E8F3FE" },
};
const DEFAULT_STEP_KIND = { label: "Action", color: "#0B7FE0", soft: "#E8F3FE" };
function stepKind(actionType: string) {
  return STEP_KIND[actionType] ?? DEFAULT_STEP_KIND;
}

function ActionNode({ data, selected }: NodeProps & { data: StepNodeData }) {
  const { step, activeRuns, onOpenRun } = data;
  const actionMeta = ACTION_TYPES.find((a) => a.value === step.action_type);
  const kind = stepKind(step.action_type);
  return (
    <div
      className={`relative w-64 rounded-2xl border bg-surface px-4 py-3 shadow-soft ${selected ? "border-accent ring-2 ring-accent/25" : "border-border"}`}
    >
      <RunTicker runs={activeRuns} onOpenRun={onOpenRun} />
      <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-muted" />
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: kind.soft, color: kind.color }}
        >
          {actionIcon(step.action_type)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">{actionMeta?.label ?? step.action_type}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: kind.color }} />
            <span className="text-[11px] font-medium text-muted">
              {kind.label}
              {step.delay_minutes > 0 ? ` · ${step.delay_minutes}m` : ""}
            </span>
          </div>
        </div>
      </div>
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
      className={`relative w-80 rounded-2xl border bg-surface px-4 py-3.5 shadow-soft ${selected ? "border-accent ring-2 ring-accent/25" : "border-[#DDD9FB]"}`}
    >
      <RunTicker runs={data.activeRuns} onOpenRun={data.onOpenRun} />
      <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-muted" />
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-violetSoft text-violet">
          <Split size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">Condition</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
            <span className="text-[11px] font-medium text-muted">
              {branches.length} branch{branches.length === 1 ? "" : "es"}
            </span>
          </div>
        </div>
      </div>
      {branches.length > 0 && (
        // One row per branch (not a side-by-side grid) so each branch's full
        // condition text is legible without hovering -- with 3+ branches
        // sharing a fixed-width node, a grid truncates every label down to
        // just a few characters, making different branches look identical.
        <div className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2 text-[11px] font-medium text-muted">
          {branches.map((b, i) => (
            <span key={b.id} title={b.label || `Branch ${i + 1}`} className="truncate">
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
    <div className="w-64 cursor-pointer rounded-2xl bg-ink px-4 py-3 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.14] text-white">
          <Zap size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-white">{data.summary}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">Trigger</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-muted" isConnectable={false} />
    </div>
  );
}

// The connector's own "+" -- click it to insert a new step *between* the two
// steps it already joins (rewiring the existing connection to point at the
// new step, then reconnecting the new step to the old target), same
// interaction GHL and Tax Nitro build their canvases around. This is in
// addition to, not instead of, the "Add step" button up top -- that one
// always appends after whatever's selected; this one lets a step go
// anywhere in the middle of an existing chain without first deleting and
// redrawing connections by hand.
function StepEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd, data }: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 14 });
  const [menuOpen, setMenuOpen] = useState(false);
  const edgeData = data as { canManage?: boolean; onInsert?: (actionType: string) => void } | undefined;
  const canManage = Boolean(edgeData?.canManage);
  const onInsert = edgeData?.onInsert;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {canManage && onInsert && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all", zIndex: 20 }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label="Insert a step here"
              className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-dashed border-muted/50 bg-surface text-accent shadow-soft hover:border-accent hover:bg-accentSoft"
            >
              <Plus size={13} />
            </button>
            {menuOpen && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                className="absolute left-1/2 top-8 z-30 w-56 -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onInsert("condition");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-violetSoft"
                >
                  <Split size={14} className="text-violet" /> Condition (if/else)
                </button>
                <div className="max-h-64 overflow-y-auto border-t border-border">
                  {ACTION_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onInsert(t.value);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-accentSoft"
                    >
                      <span className="text-accent">{actionIcon(t.value)}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { action: ActionNode, condition: ConditionNode, trigger: TriggerNode };
const edgeTypes = { step: StepEdge };
const TRIGGER_NODE_ID = "__trigger__";
const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 160;
const TRUNK_X = 300;

// Graph-aware fallback for any step with no saved canvas position (never
// dragged, or added outside the canvas UI entirely -- e.g. by a migration).
// Walks the real edges breadth-first from each root step, so a plain chain
// lays out as one straight vertical line and a condition's branches spread
// out evenly to either side of it, instead of the old index-based fallback
// (autoPosition(i) = fixed x, y by array order) which ignored the graph
// completely and stacked unrelated branches on top of each other.
// Already-positioned steps are never moved by this -- it only fills in for
// the ones that have nothing saved yet.
function computeAutoLayout(steps: WorkflowStepRow[], edgeRows: WorkflowStepEdgeRow[]): Map<string, { x: number; y: number }> {
  const outgoing = new Map<string, WorkflowStepEdgeRow[]>();
  for (const e of edgeRows) {
    if (!e.to_step_id) continue;
    const list = outgoing.get(e.from_step_id) ?? [];
    list.push(e);
    outgoing.set(e.from_step_id, list);
  }
  const hasIncoming = new Set(edgeRows.filter((e) => e.to_step_id).map((e) => e.to_step_id as string));
  const roots = steps.filter((s) => !hasIncoming.has(s.id));

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  const queue: { id: string; x: number; depth: number }[] = roots.map((r) => ({ id: r.id, x: TRUNK_X, depth: 0 }));

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    visited.add(next.id);
    positions.set(next.id, { x: next.x, y: 140 + next.depth * ROW_HEIGHT });

    const outs = (outgoing.get(next.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const n = outs.length;
    outs.forEach((e, i) => {
      if (!e.to_step_id || visited.has(e.to_step_id)) return;
      const offset = n <= 1 ? 0 : (i - (n - 1) / 2) * COLUMN_WIDTH;
      queue.push({ id: e.to_step_id, x: next.x + offset, depth: next.depth + 1 });
    });
  }

  // Anything unreachable from a root (shouldn't normally happen) still needs
  // somewhere to render rather than silently disappearing.
  let strayIndex = 0;
  for (const s of steps) {
    if (!positions.has(s.id)) {
      positions.set(s.id, { x: TRUNK_X + 2 * COLUMN_WIDTH, y: 140 + strayIndex * ROW_HEIGHT });
      strayIndex += 1;
    }
  }
  return positions;
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
  if (!anchor) return { x: TRUNK_X, y: 140 };
  const anchorX = anchor.canvas_x ?? TRUNK_X;
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
  runs,
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
  tagOptions = [],
  onEditTrigger,
  onOpenRun,
}: {
  workspaceId: string;
  automationId: string;
  steps: WorkflowStepRow[];
  edges: WorkflowStepEdgeRow[];
  runs: WorkflowRunRow[];
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
  tagOptions?: string[];
  onEditTrigger: () => void;
  onOpenRun: (runId: string) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeConditionStepId, setActiveConditionStepId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // Only a run currently sitting at a step (not one that's finished or
  // failed there) belongs on the live ticker -- completed/failed runs stay
  // visible in the "All runs" table below, one click away, without
  // cluttering the canvas with stale markers.
  const runsByStepId = useMemo(() => {
    const map = new Map<string, WorkflowRunRow[]>();
    for (const r of runs) {
      if (r.status !== "running" || !r.current_step_id) continue;
      const list = map.get(r.current_step_id) ?? [];
      list.push(r);
      map.set(r.current_step_id, list);
    }
    return map;
  }, [runs]);

  const rootStepIds = useMemo(() => {
    const hasIncoming = new Set(edgeRows.map((e) => e.to_step_id));
    return steps.filter((s) => !hasIncoming.has(s.id)).map((s) => s.id);
  }, [steps, edgeRows]);

  const initialNodes: Node[] = useMemo(() => {
    const autoLayout = computeAutoLayout(steps, edgeRows);
    const stepNodes = steps.map((s) => {
      const branches = edgeRows
        .filter((e) => e.from_step_id === s.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => ({ id: e.id, label: e.label, wired: e.to_step_id != null }));
      return {
        id: s.id,
        type: s.action_type === "condition" ? "condition" : "action",
        position: s.canvas_x != null && s.canvas_y != null ? { x: s.canvas_x, y: s.canvas_y } : autoLayout.get(s.id) ?? { x: TRUNK_X, y: 140 },
        data: { step: s, branches, activeRuns: runsByStepId.get(s.id) ?? [], onOpenRun },
      };
    });
    const triggerNode: Node = {
      id: TRIGGER_NODE_ID,
      type: "trigger",
      position: { x: TRUNK_X, y: -20 },
      data: { summary: triggerSummary(triggerType, triggerConfig, organizerTemplates, services, pipelines) },
      draggable: false,
      selectable: false,
    };
    return [triggerNode, ...stepNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, edgeRows, triggerType, triggerConfig, runsByStepId, onOpenRun]);

  const initialEdges: Edge[] = useMemo(() => {
    // A branch with no destination yet (defined via the condition modal,
    // not dragged to a target) has nothing to draw a line to.
    const realEdges = edgeRows
      .filter((e): e is WorkflowStepEdgeRow & { to_step_id: string } => e.to_step_id != null)
      .map((e) => {
        const fromStep = steps.find((s) => s.id === e.from_step_id);
        return {
          id: e.id,
          type: "step",
          source: e.from_step_id,
          target: e.to_step_id,
          // Condition nodes expose one handle per branch, keyed by that
          // branch's edge id -- pin each edge to its own handle so it
          // doesn't default to whichever handle React Flow picks first.
          sourceHandle: fromStep?.action_type === "condition" ? e.id : undefined,
          label: e.label ?? undefined,
          style: e.branch_conditions ? { stroke: "var(--color-accent, #0b7fe0)" } : undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
          // A moving-dash line into whichever step currently has a live
          // ticker -- the "flows with the automation" feel, driven by the
          // same running-run data as the ticker itself rather than a
          // separate animation to keep in sync.
          animated: runsByStepId.has(e.to_step_id),
          data: { canManage, onInsert: (actionType: string) => insertStepOnEdge(e.id, actionType) },
        };
      });
    // Visual only, not a real automation_step_edges row -- shows where
    // execution actually starts (the step(s) with no incoming edge). Still
    // gets the same insert-a-step "+" as a real edge, treated as "insert
    // before this root step" (see insertStepOnEdge).
    const triggerEdges = rootStepIds.map((id) => ({
      id: `${TRIGGER_NODE_ID}-${id}`,
      type: "step",
      source: TRIGGER_NODE_ID,
      target: id,
      style: { strokeDasharray: "4 3" },
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: runsByStepId.has(id),
      data: { canManage, onInsert: (actionType: string) => insertStepOnEdge(`${TRIGGER_NODE_ID}-${id}`, actionType) },
    }));
    return [...triggerEdges, ...realEdges];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeRows, rootStepIds, steps, canManage, runsByStepId]);

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

  // Inserts a new step *between* the two steps an existing connector already
  // joins -- the connector's own "+" button, GHL/Tax Nitro's core building
  // interaction. edgeId is either a real automation_step_edges id (rewire
  // its to_step_id to the new step, then connect the new step to the old
  // target) or a virtual trigger-edge id "__trigger__-<rootStepId>" (no real
  // edge to rewire -- the new step just becomes the new root, wired straight
  // to the step that used to be first).
  async function insertStepOnEdge(edgeId: string, actionType: string) {
    const isTriggerEdge = edgeId.startsWith(TRIGGER_NODE_ID);
    const realEdge = isTriggerEdge ? null : edgeRows.find((e) => e.id === edgeId);
    if (!isTriggerEdge && !realEdge) return;
    const targetStepId = isTriggerEdge ? edgeId.slice(TRIGGER_NODE_ID.length + 1) : realEdge!.to_step_id;
    if (!targetStepId) return;
    const targetStep = steps.find((s) => s.id === targetStepId);
    const sourceStep = isTriggerEdge ? null : steps.find((s) => s.id === realEdge!.from_step_id);

    const targetX = targetStep?.canvas_x ?? TRUNK_X;
    const sourceX = sourceStep?.canvas_x ?? targetX;
    const targetY = targetStep?.canvas_y ?? 140;
    const sourceY = sourceStep?.canvas_y ?? targetY - ROW_HEIGHT;
    const position = { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };

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
      toast.show(error?.message ?? "Could not insert a step", "error");
      return;
    }
    const newStepId = (newStep as { id: string }).id;

    if (!isTriggerEdge && realEdge) {
      const { error: rewireError } = await supabase.from("automation_step_edges").update({ to_step_id: newStepId }).eq("id", realEdge.id);
      if (rewireError) {
        toast.show(rewireError.message, "error");
        return;
      }
    }
    const { error: newEdgeError } = await supabase.from("automation_step_edges").insert({
      automation_id: automationId,
      from_step_id: newStepId,
      to_step_id: targetStepId,
      sort_order: 0,
    } as never);
    if (newEdgeError) {
      toast.show(newEdgeError.message, "error");
      return;
    }

    if (actionType === "condition") {
      setActiveConditionStepId(newStepId);
    } else {
      setSelectedStepId(newStepId);
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
    // on the canvas the user has to remember to come back to. Every other
    // action type was already chosen from the full list in the Add step
    // menu, so its config panel opens immediately too, ready to fill in --
    // no separate click on the new node required.
    if (actionType === "condition") {
      setActiveConditionStepId((newStep as { id: string }).id);
    } else {
      setSelectedStepId((newStep as { id: string }).id);
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
              <div className="absolute right-0 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false);
                    addStep("condition");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-violetSoft"
                >
                  <Split size={14} className="text-violet" /> Condition (if/else)
                </button>
                <div className="max-h-72 overflow-y-auto border-t border-border">
                  {ACTION_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        addStep(t.value);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-accentSoft"
                    >
                      <span className="text-accent">{actionIcon(t.value)}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
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
          edgeTypes={edgeTypes}
          nodesDraggable={canManage}
          nodesConnectable={canManage}
          connectionRadius={40}
          elementsSelectable
          fitView
          fitViewOptions={{ maxZoom: 0.85 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#DDE1E8" />
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
              key={selectedStep.id}
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
              tagOptions={tagOptions}
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
              tagOptions={tagOptions}
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
