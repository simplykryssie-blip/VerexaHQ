import { MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { getConversations } from "@/features/messages/queries";
import { ConversationList } from "@/features/messages/conversation-list";
import { NewConversationDialog } from "@/features/messages/new-conversation-dialog";
import type { PickerOption } from "@/features/engagements/client-picker";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { search } = await searchParams;
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

  const [conversations, { data: clients }] = await Promise.all([
    getConversations(workspaceId, { search }),
    supabase.from("clients").select("id, first_name, last_name, company").eq("workspace_id", workspaceId).is("archived_at", null),
  ]);

  const clientOptions: PickerOption[] = (clients ?? []).map((c) => ({ id: c.id, label: c.company || `${c.first_name} ${c.last_name}` }));

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">Secure conversations with your clients.</p>
        </div>
        <NewConversationDialog workspaceId={workspaceId} clients={clientOptions} />
      </div>

      {conversations.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No conversations yet" description="Start a conversation with a client to see it here." />
      ) : (
        <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
          <ConversationList conversations={conversations} search={search} />
        </div>
      )}
    </div>
  );
}
