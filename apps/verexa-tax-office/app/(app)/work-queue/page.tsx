import Link from "next/link";
import { ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { engagementStatusLabel } from "@/lib/validation/engagements";
import { formatCurrency, formatDate } from "@/lib/formatters";

export default async function WorkQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const { mine } = await searchParams;
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

  let query = supabase
    .from("v_engagement_work_queue")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (mine === "1") {
    query = query.or(`primary_preparer_user_id.eq.${user!.id},reviewer_user_id.eq.${user!.id}`);
  }

  const { data: items, error } = await query;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Work Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">All open engagements across your workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant={mine === "1" ? "ghost" : "secondary"} size="sm">
            <Link href="/work-queue">All office work</Link>
          </Button>
          <Button asChild variant={mine === "1" ? "secondary" : "ghost"} size="sm">
            <Link href="/work-queue?mine=1">My assignments</Link>
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">Couldn&apos;t load the work queue. Please refresh.</p>}

      {!items || items.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing in the queue" description="Open engagements will show up here." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engagement</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Tax year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Missing docs</TableHead>
                <TableHead>Open tasks</TableHead>
                <TableHead>Balance due</TableHead>
                <TableHead>Due date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/engagements/${e.id}`} className="font-medium hover:underline">
                      {e.engagement_number ?? e.title}
                    </Link>
                  </TableCell>
                  <TableCell>{e.client_name || "—"}</TableCell>
                  <TableCell>{e.tax_year}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{engagementStatusLabel(e.status ?? "")}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{e.priority}</TableCell>
                  <TableCell>
                    {Number(e.missing_document_count) > 0 ? (
                      <Badge variant="warning">{e.missing_document_count}</Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell>{e.open_task_count ?? 0}</TableCell>
                  <TableCell>{formatCurrency(e.balance_due)}</TableCell>
                  <TableCell>{formatDate(e.due_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
