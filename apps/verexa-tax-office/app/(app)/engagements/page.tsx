import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { engagementStatusLabel } from "@/lib/validation/engagements";
import { formatDate } from "@/lib/formatters";

export default async function EngagementsPage() {
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

  const { data: engagements } = await supabase
    .from("tax_engagements")
    .select("id, engagement_number, title, tax_year, return_type, status, priority, due_date, client:clients(first_name, last_name, company)")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tax Engagements</h1>
          <p className="text-sm text-muted-foreground mt-1">All tax preparation engagements in your workspace.</p>
        </div>
        <Button asChild variant="brand">
          <Link href="/engagements/new">
            <Plus className="h-4 w-4" /> New engagement
          </Link>
        </Button>
      </div>

      {!engagements || engagements.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No tax engagements yet"
          description="Create your first engagement to start tracking a return."
          actionLabel="Create engagement"
          actionHref="/engagements/new"
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engagement</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Tax year</TableHead>
                <TableHead>Return type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {engagements.map((e) => {
                const client = e.client as { first_name?: string; last_name?: string; company?: string } | null;
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link href={`/engagements/${e.id}`} className="font-medium hover:underline">
                        {e.engagement_number ?? e.title}
                      </Link>
                    </TableCell>
                    <TableCell>{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell>{e.tax_year}</TableCell>
                    <TableCell>{e.return_type}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{engagementStatusLabel(e.status)}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{e.priority}</TableCell>
                    <TableCell>{formatDate(e.due_date)}</TableCell>
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
