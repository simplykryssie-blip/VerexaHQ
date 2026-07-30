import Link from "next/link";
import { PenTool, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getSignatureRequests } from "@/features/signatures/queries";
import { signatureRequestStatusLabel } from "@/lib/validation/signatures";
import { formatDate } from "@/lib/formatters";

export default async function SignaturesPage() {
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

  const requests = await getSignatureRequests(workspaceId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signatures</h1>
          <p className="text-sm text-muted-foreground mt-1">Engagement letters and documents awaiting e-signature.</p>
        </div>
        <Button asChild variant="brand" size="sm">
          <Link href="/signatures/new">
            <Plus className="h-4 w-4" /> New request
          </Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={PenTool} title="No signature requests yet" description="Send a document for signature to get started." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signers</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => {
                const client = r.client as { first_name?: string; last_name?: string; company?: string } | null;
                const signers = (r.signers as { status: string }[]) ?? [];
                const signed = signers.filter((s) => s.status === "signed").length;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/signatures/${r.id}`} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell>{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "success" : r.status === "declined" || r.status === "expired" ? "destructive" : "secondary"}>
                        {signatureRequestStatusLabel(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {signed}/{signers.length}
                    </TableCell>
                    <TableCell>{formatDate(r.created_at)}</TableCell>
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
