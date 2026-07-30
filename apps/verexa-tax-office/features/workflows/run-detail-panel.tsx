"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { workflowRunStatusLabel, workflowStepStatusLabel, approvalStatusLabel } from "@/lib/validation/workflows";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type RunRow = Tables<"workflow_runs"> & {
  definition?: { id?: string; name?: string } | null;
  client?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  engagement?: { engagement_number?: string | null; title?: string | null } | null;
};
type StepRow = Tables<"workflow_run_steps"> & { node?: { label?: string; node_type?: string } | null };
type EventRow = Tables<"workflow_events">;
type ApprovalRow = Tables<"workflow_approvals">;
type WaitRow = Tables<"workflow_waits">;

export function WorkflowRunDetailPanel({
  run,
  steps,
  events,
  approvals,
  waits,
  jobs,
}: {
  run: RunRow;
  steps: StepRow[];
  events: EventRow[];
  approvals: ApprovalRow[];
  waits: WaitRow[];
  jobs: Tables<"workflow_action_outbox">[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function cancelRun() {
    if (!confirm("Cancel this workflow run?")) return;
    setBusy(true);
    const { error } = await supabase.from("workflow_runs").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", run.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Run cancelled");
    router.refresh();
  }

  const client = run.client as { first_name?: string; last_name?: string; company?: string } | null;
  const engagement = run.engagement as { engagement_number?: string; title?: string } | null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{(run.definition as { name?: string } | null)?.name ?? "Workflow run"}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {client && (client.company || `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim())}
              {engagement && ` · ${engagement.engagement_number ?? engagement.title}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={run.status === "completed" ? "success" : run.status === "failed" || run.status === "cancelled" ? "destructive" : "secondary"}>
              {workflowRunStatusLabel(run.status)}
            </Badge>
            {!["completed", "failed", "cancelled"].includes(run.status) && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={cancelRun}>
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        {run.error_message && (
          <CardContent>
            <p className="text-sm text-destructive">{run.error_message}</p>
          </CardContent>
        )}
      </Card>

      {approvals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {approvals.map((a) => (
              <ApprovalRowItem key={a.id} approval={a} onResolved={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps recorded yet.</p>
          ) : (
            steps.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <span>{s.node?.label ?? "Step"}</span>
                <Badge variant={s.status === "completed" ? "success" : s.status === "failed" ? "destructive" : "secondary"}>{workflowStepStatusLabel(s.status)}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {waits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wait states</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {waits.map((w) => (
              <div key={w.id} className="rounded-md border border-border p-2.5 text-sm">
                <p>
                  {w.wait_type} {w.release_at && `until ${formatDateTime(w.release_at)}`}
                </p>
                {w.released_at ? (
                  <p className="text-xs text-success">Released {formatDateTime(w.released_at)}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Waiting…</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <div>
                  <p>{j.action_type.replace(/_/g, " ")}</p>
                  {j.error_message && <p className="text-xs text-destructive">{j.error_message}</p>}
                </div>
                <Badge variant={j.status === "completed" ? "success" : j.status === "failed" ? "destructive" : "secondary"}>{j.status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event log</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded bg-secondary px-2 py-1.5">
                  <span>{e.event_type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{formatDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApprovalRowItem({ approval, onResolved }: { approval: ApprovalRow; onResolved: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve(status: "approved" | "rejected") {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("workflow_approvals")
      .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(), resolution_notes: notes || null })
      .eq("id", approval.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(`Approval ${status}`);
    setOpen(false);
    onResolved();
  }

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{approval.title}</p>
          {approval.instructions && <p className="text-xs text-muted-foreground">{approval.instructions}</p>}
        </div>
        <Badge variant={approval.status === "approved" ? "success" : approval.status === "rejected" ? "destructive" : "secondary"}>{approvalStatusLabel(approval.status)}</Badge>
      </div>
      {approval.status === "pending" && (
        <div className="flex items-center gap-2 mt-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve("approved")}>
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost">
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject: {approval.title}</DialogTitle>
              </DialogHeader>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Reason (optional)" />
              <DialogFooter>
                <Button variant="destructive" disabled={busy} onClick={() => resolve("rejected")}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Reject
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
