import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LayoutTemplate } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { OrganizerLibrary, type OrganizerCard } from "@/components/settings/organizer-builder/OrganizerLibrary";
import { EngagementLetterLibrary, type EngagementLetterCard } from "@/components/settings/engagement-letter-editor/EngagementLetterLibrary";
import { PendingTemplateShares, type PendingShare } from "@/components/settings/PendingTemplateShares";
import type { DownlineWorkspace } from "@/components/settings/ShareTemplateModal";

export type FormTemplateTabKey = "engagement-letter" | "organizers";

// Split out from the old generic TemplateLibrary so this route's bundle never
// pulls in the Email/SMS composer's Tiptap dependency -- see EmailSmsLibrary
// for that side.
export async function FormTemplateLibrary({ workspaceId, activeTabParam }: { workspaceId: string; activeTabParam?: string }) {
  const activeTab: FormTemplateTabKey = activeTabParam === "organizers" ? "organizers" : "engagement-letter";
  const isOrganizers = activeTab === "organizers";

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspaceId}`;

  const { data: engagementLetterTemplates } = !isOrganizers
    ? await supabase
        .from("engagement_letter_templates")
        .select("id, name, status, workspace_id, folder_id, requires_signature, merge_fields")
        .or(orFilter)
        .order("name")
    : { data: null };

  const engagementLetterCards: EngagementLetterCard[] = (engagementLetterTemplates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    workspace_id: t.workspace_id,
    folder_id: t.folder_id,
    requires_signature: t.requires_signature,
    merge_field_count: Array.isArray(t.merge_fields) ? t.merge_fields.length : 0,
  }));

  const { data: organizerTemplates } = isOrganizers
    ? await supabase.from("organizer_templates").select("*").or(orFilter).order("name")
    : { data: null };

  const organizerTemplateIds = (organizerTemplates ?? []).map((t) => t.id);
  const { data: organizerFields } =
    isOrganizers && organizerTemplateIds.length > 0
      ? await supabase.from("organizer_fields").select("id, organizer_template_id, parent_field_id").in("organizer_template_id", organizerTemplateIds)
      : { data: [] as { id: string; organizer_template_id: string; parent_field_id: string | null }[] };

  const organizerCards: OrganizerCard[] = (organizerTemplates ?? []).map((t) => {
    const fieldsForTemplate = (organizerFields ?? []).filter((f) => f.organizer_template_id === t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      workspace_id: t.workspace_id,
      folder_id: t.folder_id,
      topLevelFieldCount: fieldsForTemplate.filter((f) => !f.parent_field_id).length,
      totalFieldCount: fieldsForTemplate.length,
    };
  });

  const { data: folders } = await supabase
    .from("library_folders")
    .select("id, parent_folder_id, name")
    .eq("workspace_id", workspaceId)
    .eq("item_type", "form_template")
    .order("name");

  const { data: jotformConnected } = isOrganizers ? await supabase.rpc("is_workspace_jotform_connected", { p_workspace_id: workspaceId }) : { data: false };

  // Only an ERO or Service Bureau (a "parent" in an active firm connection)
  // can share a template down to a connected firm -- never automatic, and
  // never the other direction.
  const { data: downlineRows } = await supabase
    .from("firm_connections")
    .select("child_workspace_id, workspaces:child_workspace_id(id, name)")
    .eq("parent_workspace_id", workspaceId)
    .eq("status", "active");
  const downlineWorkspaces: DownlineWorkspace[] = (downlineRows ?? [])
    .map((r) => r.workspaces as unknown as { id: string; name: string } | null)
    .filter((w): w is { id: string; name: string } => Boolean(w));

  const { data: pendingShareRows } = await supabase
    .from("config_object_shares")
    .select("id, object_type, object_id, workspaces:shared_by_workspace_id(name)")
    .eq("shared_with_workspace_id", workspaceId)
    .eq("status", "pending")
    .in("object_type", ["organizer_templates", "engagement_letter_templates"]);

  const pendingOrganizerIds = (pendingShareRows ?? []).filter((r) => r.object_type === "organizer_templates").map((r) => r.object_id);
  const pendingLetterIds = (pendingShareRows ?? []).filter((r) => r.object_type === "engagement_letter_templates").map((r) => r.object_id);

  const [{ data: pendingOrganizerNames }, { data: pendingLetterNames }] = await Promise.all([
    pendingOrganizerIds.length > 0
      ? supabase.from("organizer_templates").select("id, name").in("id", pendingOrganizerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    pendingLetterIds.length > 0
      ? supabase.from("engagement_letter_templates").select("id, name").in("id", pendingLetterIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const objectNameById = new Map(
    [...(pendingOrganizerNames ?? []), ...(pendingLetterNames ?? [])].map((o) => [o.id, o.name])
  );

  const pendingShares: PendingShare[] = (pendingShareRows ?? []).map((r) => ({
    id: r.id,
    objectType: r.object_type as PendingShare["objectType"],
    objectName: objectNameById.get(r.object_id) ?? "Untitled",
    sharedByFirmName: (r.workspaces as unknown as { name?: string } | null)?.name ?? "A connected firm",
  }));

  const tabs: { key: FormTemplateTabKey; label: string }[] = [
    { key: "engagement-letter", label: "Engagement Letters" },
    { key: "organizers", label: "Organizers" },
  ];

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader
        icon={LayoutTemplate}
        title="Form Templates"
        description="Engagement letter and organizer templates. See Email & SMS in the Templates menu for message templates."
      />

      <div className="mt-4">
        <nav className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/templates?tab=${t.key}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4">
        <PendingTemplateShares shares={pendingShares} />
        {isOrganizers ? (
          <OrganizerLibrary
            workspaceId={workspaceId}
            templates={organizerCards}
            folders={folders ?? []}
            isJotformConnected={Boolean(jotformConnected)}
            downlineWorkspaces={downlineWorkspaces}
          />
        ) : (
          <EngagementLetterLibrary
            workspaceId={workspaceId}
            templates={engagementLetterCards}
            folders={folders ?? []}
            downlineWorkspaces={downlineWorkspaces}
          />
        )}
      </div>
    </div>
  );
}
