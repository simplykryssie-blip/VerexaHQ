import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { OrganizerBuilder } from "@/components/settings/organizer-builder/OrganizerBuilder";
import type { BuilderField } from "@/components/settings/organizer-builder/types";

export const dynamic = "force-dynamic";

export default async function OrganizerBuilderPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: template }, { data: fields }] = await Promise.all([
    supabase
      .from("organizer_templates")
      .select("id, name, slug, description, status, workspace_id, public_token, is_public, requires_portal_signup")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("organizer_fields")
      .select("id, organizer_template_id, parent_field_id, field_type, label, help_text, display_order, is_required, options, conditional_logic")
      .eq("organizer_template_id", params.id)
      .order("display_order"),
  ]);

  if (!template) notFound();

  const readOnly = !template.workspace_id;

  return <OrganizerBuilder template={template} initialFields={(fields ?? []) as BuilderField[]} readOnly={readOnly} />;
}
