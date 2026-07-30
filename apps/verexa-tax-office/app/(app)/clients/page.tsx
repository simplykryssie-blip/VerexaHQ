import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { ClientFormDialog } from "@/features/clients/client-form-dialog";
import { ClientsTable } from "@/features/clients/clients-table";
import { ClientsFilters } from "@/features/clients/clients-filters";
import { CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/validation/clients";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const { q, type, status } = await searchParams;
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

  let query = supabase.from("clients").select("*").eq("workspace_id", workspaceId).is("archived_at", null);
  if (type) query = query.eq("client_type", type as (typeof CLIENT_TYPES)[number]);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`);

  const { data: clients, error } = await query.order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your client relationships.</p>
        </div>
        <ClientFormDialog workspaceId={workspaceId} />
      </div>

      <ClientsFilters types={CLIENT_TYPES} statuses={CLIENT_STATUSES} />

      {error && <p className="text-sm text-destructive">Couldn&apos;t load clients. Please refresh.</p>}

      {!clients || clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || type || status ? "No clients match your filters" : "No clients yet"}
          description={q || type || status ? "Try adjusting your search or filters." : "Add your first client to get started."}
        />
      ) : (
        <ClientsTable clients={clients} />
      )}
    </div>
  );
}
