import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getWorkflowRuns } from "@/features/workflows/queries";
import { workflowRunStatusLabel } from "@/lib/validation/workflows";
import { formatDateTime } from "@/lib/formatters";

export default async function WorkflowRunsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const runs = await getWorkflowRuns(workspaceId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflow Runs</h1>
        <p className="text-sm text-muted-foreground mt-1">Every time a workflow has started, succeeded, or failed.</p>
      </div>

      {runs.length === 0 ? (
        <EmptyState icon={PlayCircle} title="No workflow runs yet" description="Runs appear here once a workflow is started manually or by its trigger." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const client = r.client as { first_name?: string; last_name?: string; company?: string } | null;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/workflows/runs/${r.id}`} className="font-medium hover:underline">
                        {(r.definition as { name?: string } | null)?.name ?? "Workflow"}
                      </Link>
                    </TableCell>
                    <TableCell>{client ? client.company || `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "success" : r.status === "failed" ? "destructive" : "secondary"}>{workflowRunStatusLabel(r.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatDateTime(r.started_at ?? r.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
