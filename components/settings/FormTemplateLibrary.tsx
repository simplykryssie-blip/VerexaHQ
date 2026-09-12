import { createClient } from "@/lib/supabase/server";
import { LayoutTemplate, FileText, ListChecks, ClipboardList, Share2 } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { StatTile } from "@/components/ui/StatTile";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { OrganizerLibrary, type OrganizerCard } from "@/components/settings/organizer-builder/OrganizerLibrary";
import { EngagementLetterLibrary, type EngagementLetterCard } from "@/components/settings/engagement-letter-editor/EngagementLetterLibrary";
import { DocumentRequestLibrary, type DocumentRequestTemplateCard } from "@/components/settings/document-request-editor/DocumentRequestLibrary";
import { PendingTemplateShares, type PendingShare } from "@/components/settings/PendingTemplateShares";
import type { DownlineWorkspace } from "@/components/settings/ShareTemplateModal";

export type FormTemplateTabKey = "engagement-letter" | "organizers" | "document-requests";

// Split out from the old generic TemplateLibrary so this route's bundle never
// pulls in the Email/SMS composer's Tiptap dependency -- see EmailSmsLibrary
// for that side.
export async function FormTemplateLibrary({ workspaceId, activeTabParam }: { workspaceId: string; activeTabParam?: string }) {
  const activeTab: FormTemplateTabKey =
    activeTabParam === "organizers" ? "organizers" : activeTabParam === "document-requests" ? "document-requests" : "engagement-letter";
  const isOrganizers = activeTab === "organizers";
  const isDocumentRequests = activeTab === "document-requests";

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspaceId}`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: starredRows } = user
    ? await supabase
        .from("starred_items")
        .select("entity_type, entity_id")
        .eq("user_id", user.id)
        .in("entity_type", ["organizer_template", "engagement_letter_template", "document_request_template"])
    : { data: [] as { entity_type: string; entity_id: string }[] };
  const starredOrganizerIds = new Set((starredRows ?? []).filter((r) => r.entity_type === "organizer_template").map((r) => r.entity_id));
  const starredLetterIds = new Set((starredRows ?? []).filter((r) => r.entity_type === "engagement_letter_template").map((r) => r.entity_id));
  const starredDocumentRequestIds = new Set((starredRows ?? []).filter((r) => r.entity_type === "document_request_template").map((r) => r.entity_id));

  const { data: engagementLetterTemplates } = !isOrganizers && !isDocumentRequests
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

  const { data: documentRequestTemplates } = isDocumentRequests
    ? await supabase
        .from("document_request_templates")
        .select("id, name, description, status, workspace_id, folder_id")
        .or(orFilter)
        .order("name")
    : { data: null };

  const documentRequestTemplateIds = (documentRequestTemplates ?? []).map((t) => t.id);
  const { data: documentRequestItems } =
    isDocumentRequests && documentRequestTemplateIds.length > 0
      ? await supabase.from("document_request_items").select("id, document_request_template_id, is_required").in("document_request_template_id", documentRequestTemplateIds)
      : { data: [] as { id: string; document_request_template_id: string; is_required: boolean }[] };

  const documentRequestCards: DocumentRequestTemplateCard[] = (documentRequestTemplates ?? []).map((t) => {
    const itemsForTemplate = (documentRequestItems ?? []).filter((i) => i.document_request_template_id === t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      workspace_id: t.workspace_id,
      folder_id: t.folder_id,
      itemCount: itemsForTemplate.length,
      requiredCount: itemsForTemplate.filter((i) => i.is_required).length,
    };
  });

  // The stat row always shows all three counts regardless of which tab is
  // active -- the active tab's count comes free from the cards array already
  // fetched above; the other two get a cheap head-only count query instead
  // of pulling their full rows. Archived templates are excluded from every
  // count here, matching the gallery's own default "All" view (TemplateGallery
  // deliberately hides archived unless that filter pill is picked) -- otherwise
  // the stat tile would claim a template that the list right below it doesn't show.
  const [{ count: engagementLetterCountRaw }, { count: organizerCountRaw }, { count: documentRequestCountRaw }] = await Promise.all([
    !isOrganizers && !isDocumentRequests
      ? Promise.resolve({ count: null as number | null })
      : supabase.from("engagement_letter_templates").select("id", { count: "exact", head: true }).or(orFilter).neq("status", "archived"),
    isOrganizers
      ? Promise.resolve({ count: null as number | null })
      : supabase.from("organizer_templates").select("id", { count: "exact", head: true }).or(orFilter).neq("status", "archived"),
    isDocumentRequests
      ? Promise.resolve({ count: null as number | null })
      : supabase.from("document_request_templates").select("id", { count: "exact", head: true }).or(orFilter).neq("status", "archived"),
  ]);
  const engagementLetterCount = !isOrganizers && !isDocumentRequests
    ? engagementLetterCards.filter((c) => c.status !== "archived").length
    : engagementLetterCountRaw ?? 0;
  const organizerCount = isOrganizers ? organizerCards.filter((c) => c.status !== "archived").length : organizerCountRaw ?? 0;
  const documentRequestCount = isDocumentRequests
    ? documentRequestCards.filter((c) => c.status !== "archived").length
    : documentRequestCountRaw ?? 0;

  const { data: folders } = await supabase
    .from("library_folders")
    .select("id, parent_folder_id, name")
    .eq("workspace_id", workspaceId)
    .eq("item_type", "form_template")
    .order("name");

  const { data: jotformConnected } = !isDocumentRequests
    ? await supabase.rpc("is_workspace_jotform_connected", { p_workspace_id: workspaceId })
    : { data: false };

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

  const pendingLetterShareCount = pendingShares.filter((s) => s.objectType === "engagement_letter_templates").length;
  const pendingOrganizerShareCount = pendingShares.filter((s) => s.objectType === "organizer_templates").length;

  const tabs: { key: FormTemplateTabKey; label: string; badge?: number }[] = [
    { key: "engagement-letter", label: "Documents", badge: pendingLetterShareCount },
    { key: "organizers", label: "Forms", badge: pendingOrganizerShareCount },
    { key: "document-requests", label: "Document Requests" },
  ];

  const heroSub =
    pendingShares.length > 0
      ? `${pendingShares.length} shared template${pendingShares.length === 1 ? "" : "s"} waiting for your review.`
      : `${engagementLetterCount + organizerCount + documentRequestCount} templates across documents, forms, and requests.`;

  return (
    <>
      <PageHero
        icon={LayoutTemplate}
        tone="violet"
        heading={
          <>
            Your <HeroHighlight>template library</HeroHighlight>.
          </>
        }
        subtitle={heroSub}
      />

      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <StatTile icon={FileText} tone="accent" label="Document templates" value={engagementLetterCount} />
          <StatTile icon={ListChecks} tone="emerald" label="Form templates" value={organizerCount} />
          <StatTile icon={ClipboardList} tone="amber" label="Document request templates" value={documentRequestCount} />
          <StatTile icon={Share2} tone="rose" label="Pending shares" value={pendingShares.length} />
        </div>

        <div>
          <Tabs tabs={tabs.map((t) => ({ id: t.key, label: t.label, badge: t.badge, href: `/templates?tab=${t.key}` }))} active={activeTab} />
        </div>

        <div>
          <PendingTemplateShares shares={pendingShares} />
          {isOrganizers ? (
            <OrganizerLibrary
              workspaceId={workspaceId}
              templates={organizerCards}
              folders={folders ?? []}
              isJotformConnected={Boolean(jotformConnected)}
              downlineWorkspaces={downlineWorkspaces}
              starredIds={starredOrganizerIds}
            />
          ) : isDocumentRequests ? (
            <DocumentRequestLibrary workspaceId={workspaceId} templates={documentRequestCards} folders={folders ?? []} starredIds={starredDocumentRequestIds} />
          ) : (
            <EngagementLetterLibrary
              workspaceId={workspaceId}
              templates={engagementLetterCards}
              folders={folders ?? []}
              isJotformConnected={Boolean(jotformConnected)}
              downlineWorkspaces={downlineWorkspaces}
              starredIds={starredLetterIds}
            />
          )}
        </div>
      </div>
    </>
  );
}
