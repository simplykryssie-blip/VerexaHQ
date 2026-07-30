import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalConversations } from "@/features/portal/queries";
import { getConversationDetail } from "@/features/messages/queries";
import { PortalConversationList } from "@/features/portal/conversation-list";
import { PortalConversationPanel } from "@/features/portal/conversation-panel";

export default async function PortalConversationDetailPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const [conversations, { conversation, messages }] = await Promise.all([
    getPortalConversations(context.client.id),
    getConversationDetail(conversationId),
  ]);

  if (!conversation || conversation.client_id !== context.client.id) notFound();

  return (
    <div className="space-y-3 h-[calc(100vh-6rem)] flex flex-col">
      <Link href="/portal/messages" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
        <ArrowLeft className="h-4 w-4" /> Back to conversations
      </Link>
      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
        <div className="hidden lg:block h-full">
          <PortalConversationList conversations={conversations} activeId={conversationId} />
        </div>
        <div className="flex flex-col h-full min-h-0">
          <div className="border-b border-border p-3">
            <p className="text-sm font-medium">{conversation.subject || "Conversation"}</p>
          </div>
          <div className="flex-1 min-h-0">
            <PortalConversationPanel
              conversationId={conversation.id}
              workspaceId={context.client.workspace_id}
              clientId={context.client.id}
              currentUserId={context.userId}
              initialMessages={messages}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
