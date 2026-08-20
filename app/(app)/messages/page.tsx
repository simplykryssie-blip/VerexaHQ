import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { MessagingHub } from "@/components/messaging/MessagingHub";
import { buildEntityLabelMap } from "@/lib/documentEntityLabels";

export const dynamic = "force-dynamic";

export default async function MessagesHubPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: threads }, { data: messages }] = await Promise.all([
    supabase.from("message_threads").select("*").eq("workspace_id", workspace.id).order("last_message_at", { ascending: false }),
    supabase.from("messages").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: true }),
  ]);

  const labelMap = await buildEntityLabelMap(supabase, threads ?? []);
  const threadsWithLabel = (threads ?? []).map((t) => ({
    ...t,
    contextLabel: labelMap.get(`${t.entity_type}:${t.entity_id}`)?.label ?? "Conversation",
  }));

  const staffSenderIds = Array.from(
    new Set((messages ?? []).filter((m) => m.sender_type === "staff" && m.sender_id).map((m) => m.sender_id as string))
  );
  const { data: senderProfiles } = staffSenderIds.length
    ? await supabase.from("user_profiles").select("id, display_name, avatar_url").in("id", staffSenderIds)
    : { data: [] };
  const senderProfileMap = Object.fromEntries(
    (senderProfiles ?? []).map((p) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }])
  );

  return (
    <>
      <PageHeader title="Messages" description="Every conversation across clients and engagements, in one place." />
      <div className="flex-1 px-8 py-6">
        <MessagingHub
          workspaceId={workspace.id}
          threads={threadsWithLabel}
          messages={messages ?? []}
          currentUserId={user?.id ?? ""}
          audience="staff"
          senderProfiles={senderProfileMap}
        />
      </div>
    </>
  );
}
