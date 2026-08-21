import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { MessageSquare } from "lucide-react";
import { NetworkMessagingHub, type NetworkThread, type NetworkMessage } from "@/components/messaging/NetworkMessagingHub";
import { InternalMessagingHub, type InternalThread, type InternalMessage, type Teammate } from "@/components/messaging/InternalMessagingHub";
import { MessagesTabs } from "@/components/messaging/MessagesTabs";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";

export const dynamic = "force-dynamic";

// Two independent messaging systems share this one tab: internal DMs
// between two members of *this* workspace (e.g. an ERO owner and their own
// staff), and network messaging between an ERO/SB and a separately
// connected PTIN *workspace*. Either capability is enough to show
// something useful here; a workspace with neither gets an explanation
// instead of a dead inbox.
export default async function MessagesHubPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? "";

  const [{ data: messageableRaw }, staffMembers] = await Promise.all([
    supabase.rpc("get_messageable_network_workspaces", { p_workspace_id: workspace.id }),
    getWorkspaceStaff(supabase, workspace.id),
  ]);
  const messageableWorkspaces = (messageableRaw ?? []).map((w) => ({ workspaceId: w.workspace_id, name: w.name }));
  const teammates: Teammate[] = staffMembers
    .filter((m) => m.user_id !== currentUserId)
    .map((m) => ({ id: m.user_id, name: m.display_name ?? "Team member", avatarUrl: m.avatar_url }));

  const hasNetwork = messageableWorkspaces.length > 0;
  const hasTeam = teammates.length > 0;

  if (!hasNetwork && !hasTeam) {
    const isEroOrSb = workspace.workspace_type === "ero_office" || workspace.workspace_type === "service_bureau";
    return (
      <>
        <PageHeader title="Messages" description="Internal conversations with your team and your connected network." />
        <div className="flex-1 px-8 py-6">
          <EmptyState
            icon={MessageSquare}
            message={
              isEroOrSb
                ? "You don't have any teammates or connected PTINs to message yet. Invite staff from Settings > Users & Staff, or wait for a PTIN to connect to your firm."
                : "You don't have any teammates to message yet. Invite staff from Settings > Users & Staff, or connect with an ERO/Service Bureau from Settings > Connections to message them too."
            }
          />
        </div>
      </>
    );
  }

  const [{ data: networkThreadsRaw }, { data: internalThreadsRaw }] = await Promise.all([
    hasNetwork
      ? supabase
          .from("network_message_threads")
          .select("id, workspace_a_id, workspace_b_id, last_message_at")
          .or(`workspace_a_id.eq.${workspace.id},workspace_b_id.eq.${workspace.id}`)
          .order("last_message_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    hasTeam
      ? supabase
          .from("internal_message_threads")
          .select("id, user_a_id, user_b_id, last_message_at")
          .eq("workspace_id", workspace.id)
          .or(`user_a_id.eq.${currentUserId},user_b_id.eq.${currentUserId}`)
          .order("last_message_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const networkThreadIds = (networkThreadsRaw ?? []).map((t) => t.id);
  const internalThreadIds = (internalThreadsRaw ?? []).map((t) => t.id);

  const [{ data: networkMessagesRaw }, { data: internalMessagesRaw }] = await Promise.all([
    networkThreadIds.length
      ? supabase
          .from("network_messages")
          .select("id, thread_id, sender_workspace_id, sender_user_id, body, created_at, read_at")
          .in("thread_id", networkThreadIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    internalThreadIds.length
      ? supabase
          .from("internal_messages")
          .select("id, thread_id, sender_id, body, created_at, read_at")
          .in("thread_id", internalThreadIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const otherWorkspaceIds = Array.from(
    new Set((networkThreadsRaw ?? []).map((t) => (t.workspace_a_id === workspace.id ? t.workspace_b_id : t.workspace_a_id)))
  );
  const { data: otherWorkspaces } = otherWorkspaceIds.length
    ? await supabase.from("workspaces").select("id, name").in("id", otherWorkspaceIds)
    : { data: [] };
  const otherWorkspaceNameById = new Map((otherWorkspaces ?? []).map((w) => [w.id, w.name]));

  const networkThreads: NetworkThread[] = (networkThreadsRaw ?? []).map((t) => {
    const otherId = t.workspace_a_id === workspace.id ? t.workspace_b_id : t.workspace_a_id;
    return {
      id: t.id,
      otherWorkspaceId: otherId,
      otherWorkspaceName: otherWorkspaceNameById.get(otherId) ?? "Unknown firm",
      lastMessageAt: t.last_message_at,
    };
  });

  const networkMessages: NetworkMessage[] = (networkMessagesRaw ?? []).map((m) => ({
    id: m.id,
    threadId: m.thread_id,
    senderWorkspaceId: m.sender_workspace_id,
    senderUserId: m.sender_user_id,
    body: m.body,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));

  const senderUserIds = Array.from(new Set(networkMessages.map((m) => m.senderUserId).filter((id): id is string => Boolean(id))));
  const { data: senderProfiles } = senderUserIds.length
    ? await supabase.from("user_profiles").select("id, display_name, avatar_url").in("id", senderUserIds)
    : { data: [] };
  const senderProfileMap = Object.fromEntries((senderProfiles ?? []).map((p) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]));

  const teammateById = new Map(teammates.map((t) => [t.id, t]));
  const internalThreads: InternalThread[] = (internalThreadsRaw ?? []).map((t) => {
    const otherId = t.user_a_id === currentUserId ? t.user_b_id : t.user_a_id;
    const other = teammateById.get(otherId);
    return {
      id: t.id,
      otherUserId: otherId,
      otherUserName: other?.name ?? "Team member",
      otherUserAvatar: other?.avatarUrl ?? null,
      lastMessageAt: t.last_message_at,
    };
  });

  const internalMessages: InternalMessage[] = (internalMessagesRaw ?? []).map((m) => ({
    id: m.id,
    threadId: m.thread_id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));

  const teamHub = hasTeam ? (
    <InternalMessagingHub workspaceId={workspace.id} threads={internalThreads} messages={internalMessages} currentUserId={currentUserId} teammates={teammates} />
  ) : null;

  const networkHub = hasNetwork ? (
    <NetworkMessagingHub
      workspaceId={workspace.id}
      threads={networkThreads}
      messages={networkMessages}
      currentUserId={currentUserId}
      messageableWorkspaces={messageableWorkspaces}
      senderProfiles={senderProfileMap}
    />
  ) : null;

  const teamUnread = internalMessages.filter((m) => m.senderId !== currentUserId && !m.readAt).length;
  const networkUnread = networkMessages.filter((m) => m.senderWorkspaceId !== workspace.id && !m.readAt).length;

  return (
    <>
      <PageHeader title="Messages" description="Internal conversations with your team and your connected network." />
      <div className="flex-1 px-8 py-6">
        {hasTeam && hasNetwork ? (
          <MessagesTabs team={teamHub} network={networkHub} teamUnread={teamUnread} networkUnread={networkUnread} />
        ) : (
          teamHub ?? networkHub
        )}
      </div>
    </>
  );
}
