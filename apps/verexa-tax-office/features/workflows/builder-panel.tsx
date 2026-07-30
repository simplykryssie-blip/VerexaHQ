"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { WORKFLOW_NODE_TYPE_LABELS, workflowNodeTypeLabel } from "@/lib/validation/workflows";
import type { Enums, Tables } from "@/types/database";

type Definition = Tables<"workflow_definitions">;
type NodeRow = Tables<"workflow_nodes">;
type ConnectionRow = Tables<"workflow_connections">;

export function WorkflowBuilderPanel({ definition, nodes, connections }: { definition: Definition; nodes: NodeRow[]; connections: ConnectionRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [newNodeKey, setNewNodeKey] = useState("");
  const [newNodeType, setNewNodeType] = useState<Enums<"workflow_node_type">>("task");
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [connSource, setConnSource] = useState("");
  const [connTarget, setConnTarget] = useState("");

  async function toggleActive() {
    setBusy(true);
    const { error } = await supabase.from("workflow_definitions").update({ is_active: !definition.is_active }).eq("id", definition.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(definition.is_active ? "Workflow deactivated" : "Workflow activated");
    router.refresh();
  }

  async function addNode() {
    if (!newNodeKey.trim() || !newNodeLabel.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("workflow_nodes").insert({
      workflow_definition_id: definition.id,
      node_key: newNodeKey.trim(),
      node_type: newNodeType,
      label: newNodeLabel.trim(),
      position_x: nodes.length * 220,
      position_y: 0,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    setNewNodeKey("");
    setNewNodeLabel("");
    router.refresh();
  }

  async function removeNode(id: string) {
    setBusy(true);
    const { error } = await supabase.from("workflow_nodes").delete().eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    router.refresh();
  }

  async function addConnection() {
    if (!connSource || !connTarget || connSource === connTarget) return;
    setBusy(true);
    const { error } = await supabase.from("workflow_connections").insert({
      workflow_definition_id: definition.id,
      source_node_id: connSource,
      target_node_id: connTarget,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    router.refresh();
  }

  async function removeConnection(id: string) {
    setBusy(true);
    const { error } = await supabase.from("workflow_connections").delete().eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    router.refresh();
  }

  async function startRun() {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("workflow_runs")
      .insert({
        workflow_definition_id: definition.id,
        template_version_id: definition.template_version_id,
        workspace_id: definition.workspace_id!,
        status: "queued",
        trigger_type: "manual",
        started_by: user?.id ?? null,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    toast.success("Run started");
    router.push(`/workflows/runs/${data.id}`);
  }

  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label ?? "?";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{definition.name}</CardTitle>
            {definition.description && <CardDescription>{definition.description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={definition.is_active ? "success" : "outline"}>{definition.is_active ? "Active" : "Inactive"}</Badge>
            <Button size="sm" variant="outline" disabled={busy} onClick={toggleActive}>
              {definition.is_active ? "Deactivate" : "Activate"}
            </Button>
            {definition.allow_manual_start && (
              <Button size="sm" variant="brand" disabled={busy || nodes.length === 0} onClick={startRun}>
                <Play className="h-4 w-4" /> Start run
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nodes</CardTitle>
          <CardDescription>Each node is a step. Give every node a unique key (e.g. "send_welcome_email").</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {nodes.map((n) => (
            <div key={n.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
              <div>
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground">
                  {n.node_key} · {workflowNodeTypeLabel(n.node_type)}
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeNode(n.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
            <Input placeholder="Key" value={newNodeKey} onChange={(e) => setNewNodeKey(e.target.value)} />
            <Input placeholder="Label" value={newNodeLabel} onChange={(e) => setNewNodeLabel(e.target.value)} />
            <Select value={newNodeType} onValueChange={(v) => setNewNodeType(v as typeof newNodeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(WORKFLOW_NODE_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={busy} onClick={addNode}>
              <Plus className="h-4 w-4" /> Add node
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connections</CardTitle>
          <CardDescription>Draws the path from one node to the next.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm">
              <span>
                {nodeLabel(c.source_node_id)} → {nodeLabel(c.target_node_id)}
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeConnection(c.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {nodes.length >= 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <Select value={connSource} onValueChange={setConnSource}>
                <SelectTrigger>
                  <SelectValue placeholder="From node" />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={connTarget} onValueChange={setConnTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="To node" />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={busy} onClick={addConnection}>
                <Plus className="h-4 w-4" /> Connect
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
