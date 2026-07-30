import { createClient } from "@/lib/supabase/server";
import { getDocuments, getDocumentCategories } from "@/features/documents/queries";
import { DocumentsTable } from "@/features/documents/documents-table";
import { UploadDocumentDialog } from "@/features/documents/upload-dialog";
import type { PickerOption } from "@/features/engagements/client-picker";
import { ClientFilterForm } from "@/features/documents/client-filter";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
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

  const [documents, categories, { data: clients }] = await Promise.all([
    getDocuments(workspaceId, { clientId: client }),
    getDocumentCategories(),
    supabase.from("clients").select("id, first_name, last_name, company").eq("workspace_id", workspaceId).is("archived_at", null),
  ]);

  const clientOptions: PickerOption[] = (clients ?? []).map((c) => ({ id: c.id, label: c.company || `${c.first_name} ${c.last_name}` }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">Secure client documents across your workspace.</p>
        </div>
        {client && <UploadDocumentDialog workspaceId={workspaceId} clientId={client} categories={categories} />}
      </div>

      <div className="max-w-sm">
        <ClientFilterForm clients={clientOptions} selectedClientId={client} />
      </div>

      <DocumentsTable documents={documents} showClient={!client} />
    </div>
  );
}
