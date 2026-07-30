import { createClient } from "@/lib/supabase/server";
import { getRequestTemplates } from "@/features/document-requests/queries";
import { getDocumentCategories } from "@/features/documents/queries";
import { NewDocumentRequestWizard } from "@/features/document-requests/new-request-wizard";
import type { PickerOption } from "@/features/engagements/client-picker";

export default async function NewDocumentRequestPage() {
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

  const [{ data: clients }, { data: staffMembers }, categories, templates] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, company").eq("workspace_id", workspaceId).is("archived_at", null),
    supabase
      .from("workspace_members")
      .select("user_id, profile:user_profiles(display_name, first_name, last_name)")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    getDocumentCategories(),
    getRequestTemplates(workspaceId),
  ]);

  const clientOptions: PickerOption[] = (clients ?? []).map((c) => ({ id: c.id, label: c.company || `${c.first_name} ${c.last_name}` }));
  const staffOptions: PickerOption[] = (staffMembers ?? []).map((s) => {
    const profile = s.profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
    return { id: s.user_id, label: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Team member" };
  });
  const templateOptions = templates.map((t) => ({ id: t.id, title: t.title, template_id: t.template_id }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New document request</h1>
        <p className="text-sm text-muted-foreground mt-1">Build a request from scratch or start from a saved template.</p>
      </div>
      <NewDocumentRequestWizard workspaceId={workspaceId} clients={clientOptions} staff={staffOptions} categories={categories} templates={templateOptions} />
    </div>
  );
}
