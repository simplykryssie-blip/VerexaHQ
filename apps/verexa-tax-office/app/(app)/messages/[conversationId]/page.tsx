import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getConversations, getConversationDetail } from "@/features/messages/queries";
import { ConversationList } from "@/features/messages/conversation-list";
import { ConversationPanel } from "@/features/messages/conversation-panel";

export default async function ConversationDetailPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const [conversations, { conversation, messages }] = await Promise.all([getConversations(workspaceId), getConversationDetail(conversationId)]);

  if (!conversation) notFound();
  const client = conversation.client as { id: string; first_name?: string; last_name?: string; company?: string } | null;

  const { data: clientDocs } = await supabase
    .from("documents")
    .select("id, display_name")
    .eq("client_id", conversation.client_id)
    .is("deleted_at", null)
    .eq("is_latest_version", true)
    .order("uploaded_at", { ascending: false });

  return (
    <div className="space-y-3 h-[calc(100vh-6rem)] flex flex-col">
      <Link href="/messages" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
        <ArrowLeft className="h-4 w-4" /> Back to conversations
      </Link>
      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
        <div className="hidden lg:block h-full">
          <ConversationList conversations={conversations} activeId={conversationId} />
        </div>
        <div className="flex flex-col h-full min-h-0">
          <div className="border-b border-border p-3">
            <p className="text-sm font-medium">{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim()}</p>
            {conversation.subject && <p className="text-xs text-muted-foreground">{conversation.subject}</p>}
          </div>
          <div className="flex-1 min-h-0">
            <ConversationPanel
              conversationId={conversation.id}
              workspaceId={workspaceId}
              clientId={conversation.client_id}
              currentUserId={user!.id}
              initialMessages={messages}
              clientDocuments={clientDocs ?? []}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
