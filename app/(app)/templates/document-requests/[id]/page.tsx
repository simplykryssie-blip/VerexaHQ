import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { DocumentRequestEditor } from "@/components/settings/document-request-editor/DocumentRequestEditor";

export const dynamic = "force-dynamic";

export default async function DocumentRequestEditorPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: template } = await supabase
    .from("document_request_templates")
    .select("id, name, slug, description, status, workspace_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!template) notFound();

  const { data: items } = await supabase
    .from("document_request_items")
    .select("id, document_request_template_id, category, name, instructions, is_required, display_order, default_folder_name")
    .eq("document_request_template_id", params.id)
    .order("display_order");

  return <DocumentRequestEditor template={template} items={items ?? []} />;
}
