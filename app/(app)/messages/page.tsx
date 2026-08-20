import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { MessageSquare } from "lucide-react";
import { NetworkMessagingHub, type NetworkThread, type NetworkMessage } from "@/components/messaging/NetworkMessagingHub";

export const dynamic = "force-dynamic";

// Internal (staff-to-staff) messaging between an ERO/SB and its connected
// PTINs -- deliberately separate from client/engagement conversations,
// which live only on their own client tab (see ClientWorkspaceTabs). Only
// relevant to an ERO/SB workspace or one connected to an ERO/SB; anyone
// else lands here to an explanation instead of an empty inbox, since the
// nav item itself is already hidden for them but a direct URL visit
// shouldn't just look broken.
export default async function MessagesHubPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: messageableRaw } = await supabase.rpc("get_messageable_network_workspaces", { p_workspace_id: workspace.id });
  const messageableWorkspaces = (messageableRaw ?? []).map((w) => ({ workspaceId: w.workspace_id, name: w.name }));

  if (messageableWorkspaces.length === 0) {
    return (
      <>
        <PageHeader title="Messages" description="Internal conversations between your firm and its connected network." />
        <div className="flex-1 px-8 py-6">
          <EmptyState
            icon={MessageSquare}
            message="Messages is for internal conversations between an ERO/Service Bureau and its connected PTINs. This workspace isn't connected to one, so there's no one to message here yet."
          />
        </div>
      </>
    );
  }

  const { data: threadsRaw } = await supabase
    .from("network_message_threads")
    .select("id, workspace_a_id, workspace_b_id, last_message_at")
    .or(`workspace_a_id.eq.${workspace.id},workspace_b_id.eq.${workspace.id}`)
    .order("last_message_at", { ascending: false });

  const threadIds = (threadsRaw ?? []).map((t) => t.id);
  const { data: messagesRaw } = threadIds.length
    ? await supabase
        .from("network_messages")
        .select("id, thread_id, sender_workspace_id, sender_user_id, body, created_at, read_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const otherWorkspaceIds = Array.from(
    new Set((threadsRaw ?? []).map((t) => (t.workspace_a_id === workspace.id ? t.workspace_b_id : t.workspace_a_id)))
  );
  const { data: otherWorkspaces } = otherWorkspaceIds.length
    ? await supabase.from("workspaces").select("id, name").in("id", otherWorkspaceIds)
    : { data: [] };
  const otherWorkspaceNameById = new Map((otherWorkspaces ?? []).map((w) => [w.id, w.name]));

  const threads: NetworkThread[] = (threadsRaw ?? []).map((t) => {
    const otherId = t.workspace_a_id === workspace.id ? t.workspace_b_id : t.workspace_a_id;
    return {
      id: t.id,
      otherWorkspaceId: otherId,
      otherWorkspaceName: otherWorkspaceNameById.get(otherId) ?? "Unknown firm",
      lastMessageAt: t.last_message_at,
    };
  });

  const messages: NetworkMessage[] = (messagesRaw ?? []).map((m) => ({
    id: m.id,
    threadId: m.thread_id,
    senderWorkspaceId: m.sender_workspace_id,
    senderUserId: m.sender_user_id,
    body: m.body,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));

  const senderUserIds = Array.from(new Set(messages.map((m) => m.senderUserId).filter((id): id is string => Boolean(id))));
  const { data: senderProfiles } = senderUserIds.length
    ? await supabase.from("user_profiles").select("id, display_name, avatar_url").in("id", senderUserIds)
    : { data: [] };
  const senderProfileMap = Object.fromEntries((senderProfiles ?? []).map((p) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]));

  return (
    <>
      <PageHeader title="Messages" description="Internal conversations between your firm and its connected network." />
      <div className="flex-1 px-8 py-6">
        <NetworkMessagingHub
          workspaceId={workspace.id}
          threads={threads}
          messages={messages}
          currentUserId={user?.id ?? ""}
          messageableWorkspaces={messageableWorkspaces}
          senderProfiles={senderProfileMap}
        />
      </div>
    </>
  );
}
