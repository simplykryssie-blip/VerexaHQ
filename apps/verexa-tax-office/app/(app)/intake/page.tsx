import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AssignOrganizerDialog } from "@/features/intake/assign-organizer-dialog";
import { getOrganizerTemplates, getIntakeSubmissionsForWorkspace } from "@/features/intake/queries";
import { INTAKE_STATUS_LABELS, intakeStatusLabel } from "@/lib/validation/intake";
import { formatDate } from "@/lib/formatters";
import type { PickerOption } from "@/features/engagements/client-picker";

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
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

  const [submissions, templates, { data: clients }] = await Promise.all([
    getIntakeSubmissionsForWorkspace(workspaceId, { status }),
    getOrganizerTemplates(workspaceId),
    supabase.from("clients").select("id, first_name, last_name, company").eq("workspace_id", workspaceId).is("archived_at", null),
  ]);

  const clientOptions: PickerOption[] = (clients ?? []).map((c) => ({
    id: c.id,
    label: c.company || `${c.first_name} ${c.last_name}`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Intake Organizers</h1>
          <p className="text-sm text-muted-foreground mt-1">Assign, track, and review client intake organizers.</p>
        </div>
        <AssignOrganizerDialog workspaceId={workspaceId} templates={templates} clients={clientOptions} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant={!status ? "secondary" : "ghost"} size="sm">
          <Link href="/intake">All</Link>
        </Button>
        {Object.entries(INTAKE_STATUS_LABELS).map(([value, label]) => (
          <Button asChild key={value} variant={status === value ? "secondary" : "ghost"} size="sm">
            <Link href={`/intake?status=${value}`}>{label}</Link>
          </Button>
        ))}
      </div>

      {submissions.length === 0 ? (
        <EmptyState icon={FileText} title="No intake organizers yet" description="Assign an organizer template to a client to get started." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((s) => {
                const client = s.client as { id: string; first_name?: string; last_name?: string; company?: string } | null;
                const template = s.template as { id: string; name?: string } | null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/intake/${s.id}`} className="font-medium hover:underline">
                        {client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{template?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{intakeStatusLabel(s.status)}</Badge>
                    </TableCell>
                    <TableCell>{Math.round(Number(s.progress_percent ?? 0))}%</TableCell>
                    <TableCell>{formatDate(s.due_date)}</TableCell>
                    <TableCell>{formatDate(s.assigned_at)}</TableCell>
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
