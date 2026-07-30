import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ComplianceCaseFormDialog } from "@/features/compliance/case-form-dialog";
import { getComplianceCases, getUnresolvedFlagCount } from "@/features/compliance/queries";
import { caseStatusLabel, caseTypeLabel, riskLevelLabel } from "@/lib/validation/compliance";
import { formatDate } from "@/lib/formatters";
import type { PickerOption } from "@/features/engagements/client-picker";

export default async function CompliancePage() {
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

  const [cases, unresolvedFlags, { data: clients }, { data: staff }] = await Promise.all([
    getComplianceCases(workspaceId),
    getUnresolvedFlagCount(workspaceId),
    supabase.from("clients").select("id, first_name, last_name, company").eq("workspace_id", workspaceId).is("archived_at", null),
    supabase
      .from("workspace_members")
      .select("user_id, profile:user_profiles(display_name, first_name, last_name)")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
  ]);

  const clientOptions: PickerOption[] = (clients ?? []).map((c) => ({ id: c.id, label: c.company || `${c.first_name} ${c.last_name}` }));
  const staffOptions: PickerOption[] = (staff ?? []).map((s) => {
    const profile = s.profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
    return {
      id: s.user_id,
      label: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Team member",
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
          <p className="text-sm text-muted-foreground mt-1">Due-diligence cases, flags, and checklists.</p>
        </div>
        <ComplianceCaseFormDialog workspaceId={workspaceId} clients={clientOptions} staff={staffOptions} />
      </div>

      {unresolvedFlags > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> {unresolvedFlags} unresolved compliance flag{unresolvedFlags === 1 ? "" : "s"} across your workspace.
        </div>
      )}

      {cases.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No compliance cases yet" description="Cases open automatically from intake compliance checks, or you can open one manually." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => {
                const client = c.client as { first_name?: string; last_name?: string; company?: string } | null;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/compliance/${c.id}`} className="font-medium hover:underline">
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell>{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell>{caseTypeLabel(c.case_type)}</TableCell>
                    <TableCell>
                      <Badge variant={c.risk_level === "critical" || c.risk_level === "high" ? "destructive" : "warning"}>{riskLevelLabel(c.risk_level)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{caseStatusLabel(c.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(c.opened_at)}</TableCell>
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
