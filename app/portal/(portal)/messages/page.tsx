import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { MessagingHub } from "@/components/messaging/MessagingHub";

export const dynamic = "force-dynamic";

export default async function PortalMessagesPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myEngagements } = await supabase.from("engagements").select("id").eq("client_id", identity.clientId);
  const engagementIds = (myEngagements ?? []).map((e) => e.id);
  const entityFilter =
    engagementIds.length > 0
      ? `and(entity_type.eq.client,entity_id.eq.${identity.clientId}),and(entity_type.eq.engagement,entity_id.in.(${engagementIds.join(",")}))`
      : `and(entity_type.eq.client,entity_id.eq.${identity.clientId})`;

  const { data: threads } = await supabase.from("message_threads").select("*").or(entityFilter).order("last_message_at", { ascending: false });
  const threadIds = (threads ?? []).map((t) => t.id);
  const { data: messages } =
    threadIds.length > 0
      ? await supabase.from("messages").select("*").in("thread_id", threadIds).order("created_at", { ascending: true })
      : { data: [] };

  const { data: engagements } =
    engagementIds.length > 0
      ? await supabase.from("engagements").select("id, engagement_number, services(name)").in("id", engagementIds)
      : { data: [] as { id: string; engagement_number: string | null; services: { name: string } | null }[] };
  const engagementLabel = new Map(
    (engagements ?? []).map((e) => [e.id, `${(e.services as unknown as { name?: string } | null)?.name ?? "Engagement"} -- ${e.engagement_number ?? ""}`])
  );

  const threadsWithLabel = (threads ?? []).map((t) => ({
    ...t,
    contextLabel: t.entity_type === "engagement" ? (engagementLabel.get(t.entity_id) ?? "Engagement") : "General",
  }));

  return (
    <>
      <PageHeader title="Messages" description="Conversations with your firm." />
      <div className="flex-1 px-8 py-6">
        <MessagingHub
          workspaceId={identity.workspaceId}
          threads={threadsWithLabel}
          messages={messages ?? []}
          currentUserId={user?.id ?? ""}
          audience="portal"
          newThreadEntity={{ entityType: "client", entityId: identity.clientId }}
        />
      </div>
    </>
  );
}
