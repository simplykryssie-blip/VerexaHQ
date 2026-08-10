import { getCurrentWorkspace } from "@/lib/workspace";
import { Zap } from "lucide-react";
import { TemplateLibrary } from "@/components/settings/TemplateLibrary";

export const dynamic = "force-dynamic";

export default async function AutomationsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  return (
    <TemplateLibrary
      workspaceId={workspace.id}
      basePath="/automations"
      tabs={[
        { key: "email", label: "Email" },
        { key: "sms", label: "SMS" },
      ]}
      heading="Automations"
      description={
        "Email and SMS templates used across the app. Use {{merge_field}} tokens -- they're substituted automatically when a message sends. " +
        "Trigger/condition/action rules are not built yet -- templates are managed here for now."
      }
      icon={Zap}
      activeTabParam={searchParams.tab}
    />
  );
}
