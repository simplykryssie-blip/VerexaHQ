import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getDocumentRequests } from "@/features/document-requests/queries";
import { requestStatusLabel } from "@/lib/validation/document-requests";
import { formatDate } from "@/lib/formatters";

export default async function DocumentRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
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

  const requests = await getDocumentRequests(workspaceId, { status });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Document Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Ask clients for the documents you need, and track what comes back.</p>
        </div>
        <Button asChild variant="brand" size="sm">
          <Link href="/document-requests/new">
            <Plus className="h-4 w-4" /> New request
          </Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No document requests yet" description="Create a request to ask a client for specific documents." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Due date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => {
                const client = r.client as { first_name?: string; last_name?: string; company?: string } | null;
                const items = (r.items as { status: string }[]) ?? [];
                const complete = items.filter((i) => ["accepted", "waived", "not_applicable"].includes(i.status)).length;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/document-requests/${r.id}`} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell>{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{requestStatusLabel(r.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      {complete}/{items.length}
                    </TableCell>
                    <TableCell>{formatDate(r.due_date)}</TableCell>
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
