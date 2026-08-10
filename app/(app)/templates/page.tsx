import { getCurrentWorkspace } from "@/lib/workspace";
import { LayoutTemplate } from "lucide-react";
import { TemplateLibrary } from "@/components/settings/TemplateLibrary";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  return (
    <TemplateLibrary
      workspaceId={workspace.id}
      basePath="/templates"
      tabs={[
        { key: "engagement-letter", label: "Engagement Letters" },
        { key: "organizers", label: "Organizers" },
      ]}
      heading="Form Templates"
      description="Engagement letter and organizer templates. See Email & SMS in the Templates menu for message templates."
      icon={LayoutTemplate}
      activeTabParam={searchParams.tab}
    />
  );
}
