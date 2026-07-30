import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatDateTime } from "@/lib/formatters";

export default async function AuditLogsPage() {
  const active = await getActiveWorkspace();
  if (!active) redirect("/workspaces");
  if (active.role !== "owner" && active.role !== "admin" && active.role !== "auditor") redirect("/unauthorized");

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("workspace_id", active.workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Entries recorded by administrative actions in your workspace.</p>
      </div>

      {!logs || logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit log entries yet" description="Sensitive administrative actions will be recorded here as they happen." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.entity_type}
                    {log.entity_id && ` · ${log.entity_id}`}
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(log.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
