import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ServiceFormDialog } from "@/features/services/service-form-dialog";
import { ServiceStatusToggle } from "@/features/services/service-status-toggle";

export default async function ServicesPage() {
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

  // Workspace-level service offerings (client_id is null) — services tied
  // to a specific client show up on that client's Services tab instead.
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("client_id", null)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="text-sm text-muted-foreground mt-1">The services your workspace offers.</p>
        </div>
        <ServiceFormDialog workspaceId={workspaceId} />
      </div>

      {!services || services.length === 0 ? (
        <EmptyState icon={Wallet} title="No services yet" description="Add the services your workspace offers to clients." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.description || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "success" : "muted"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ServiceStatusToggle id={s.id} status={s.status} />
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
