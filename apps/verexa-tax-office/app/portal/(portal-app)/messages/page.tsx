import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalConversations } from "@/features/portal/queries";
import { PortalConversationList } from "@/features/portal/conversation-list";
import { PortalNewConversationDialog } from "@/features/portal/new-conversation-dialog";
import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export default async function PortalMessagesPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const conversations = await getPortalConversations(context.client.id);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">Secure messages with your tax office.</p>
        </div>
        <PortalNewConversationDialog workspaceId={context.client.workspace_id} clientId={context.client.id} />
      </div>
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden">
        {conversations.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No conversations yet" description="Send a message to get started." />
        ) : (
          <PortalConversationList conversations={conversations} />
        )}
      </div>
    </div>
  );
}
