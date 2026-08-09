import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EngagementLetterEditor } from "@/components/settings/engagement-letter-editor/EngagementLetterEditor";

export const dynamic = "force-dynamic";

export default async function EngagementLetterEditorPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: template } = await supabase
    .from("engagement_letter_templates")
    .select("id, name, slug, status, workspace_id, body_html, requires_signature, merge_fields")
    .eq("id", params.id)
    .maybeSingle();

  if (!template) notFound();

  return <EngagementLetterEditor template={template} />;
}
