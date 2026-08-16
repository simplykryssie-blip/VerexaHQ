import { getCurrentWorkspace } from "@/lib/workspace";
import { FormTemplateLibrary } from "@/components/settings/FormTemplateLibrary";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  return <FormTemplateLibrary workspaceId={workspace.id} />;
}
