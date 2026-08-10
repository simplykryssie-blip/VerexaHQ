import { getCurrentWorkspace } from "@/lib/workspace";
import { EmailSmsLibrary } from "@/components/settings/EmailSmsLibrary";

export const dynamic = "force-dynamic";

export default async function EmailSmsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  return <EmailSmsLibrary workspaceId={workspace.id} activeTabParam={searchParams.tab} />;
}
