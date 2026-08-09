import { getCurrentWorkspace } from "@/lib/workspace";
import { TemplateLibrary } from "@/components/settings/TemplateLibrary";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  return (
    <TemplateLibrary
      workspaceId={workspace.id}
      basePath="/settings/templates"
      tabs={[
        { key: "engagement-letter", label: "Engagement Letters" },
        { key: "organizers", label: "Organizers" },
      ]}
      heading="Templates"
      description="Engagement letter and organizer templates. Email and SMS templates moved to Settings > Automations."
      activeTabParam={searchParams.tab}
    />
  );
}
