import Link from "next/link";
import { UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { LeadFormDialog } from "@/features/leads/lead-form-dialog";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/validation/leads";
import { formatDate } from "@/lib/formatters";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const { view = "table", status } = await searchParams;
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
    .from("leads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status as (typeof LEAD_STATUSES)[number]);

  const { data: leads, error } = await query;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Track prospective clients through your pipeline.</p>
        </div>
        <LeadFormDialog workspaceId={workspaceId} />
      </div>

      <div className="flex items-center gap-2">
        <Button asChild variant={view !== "pipeline" ? "secondary" : "ghost"} size="sm">
          <Link href="/leads">Table</Link>
        </Button>
        <Button asChild variant={view === "pipeline" ? "secondary" : "ghost"} size="sm">
          <Link href="/leads?view=pipeline">Pipeline</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">Couldn&apos;t load leads. Please refresh.</p>}

      {!leads || leads.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No leads yet"
          description="Add your first lead to start tracking prospective clients."
        />
      ) : view === "pipeline" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto">
          {LEAD_STATUSES.map((s) => {
            const items = leads.filter((l) => l.status === s);
            return (
              <div key={s} className="min-w-[240px]">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center justify-between">
                  {LEAD_STATUS_LABELS[s]}
                  <span className="text-muted-foreground/70">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block rounded-lg border border-border bg-card p-3 hover:shadow-sm transition-shadow"
                    >
                      <div className="text-sm font-medium">
                        {lead.first_name} {lead.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{lead.company || lead.email || "—"}</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.first_name} {lead.last_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{lead.email}</div>
                  </TableCell>
                  <TableCell>{lead.company || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{LEAD_STATUS_LABELS[lead.status]}</Badge>
                  </TableCell>
                  <TableCell>{lead.source || "—"}</TableCell>
                  <TableCell>{formatDate(lead.consultation_at)}</TableCell>
                  <TableCell>{formatDate(lead.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
