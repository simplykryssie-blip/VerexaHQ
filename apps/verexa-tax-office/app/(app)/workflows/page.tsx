import Link from "next/link";
import { Workflow as WorkflowIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getWorkflowDefinitions } from "@/features/workflows/queries";
import { NewWorkflowDialog } from "@/features/workflows/new-workflow-dialog";
import { workflowTriggerLabel } from "@/lib/validation/workflows";

export default async function WorkflowsPage() {
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

  const definitions = await getWorkflowDefinitions(workspaceId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">Automate multi-step processes across your workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/workflows/runs">Runs</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/workflows/approvals">Approvals</Link>
          </Button>
          <NewWorkflowDialog workspaceId={workspaceId} />
        </div>
      </div>

      {definitions.length === 0 ? (
        <EmptyState icon={WorkflowIcon} title="No workflows yet" description="Create a workflow to automate steps like reminders, task creation, and status changes." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {definitions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/workflows/${d.id}`} className="font-medium hover:underline">
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{workflowTriggerLabel(d.trigger_type)}</TableCell>
                  <TableCell>
                    <Badge variant={d.is_active ? "success" : "outline"}>{d.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
