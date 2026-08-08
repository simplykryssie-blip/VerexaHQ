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

  const [{ data: threads }, { data: messages }] = await Promise.all([
    supabase.from("message_threads").select("*").order("last_message_at", { ascending: false }),
    supabase.from("messages").select("*").order("created_at", { ascending: true }),
  ]);

  const engagementIds = Array.from(new Set((threads ?? []).filter((t) => t.entity_type === "engagement").map((t) => t.entity_id)));
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
