import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function PortalActivityPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { data: myEngagements } = await supabase.from("engagements").select("id").eq("client_id", identity.clientId);
  const engagementIds = (myEngagements ?? []).map((e) => e.id);
  const entityFilter =
    engagementIds.length > 0
      ? `and(entity_type.eq.client,entity_id.eq.${identity.clientId}),and(entity_type.eq.engagement,entity_id.in.(${engagementIds.join(",")}))`
      : `and(entity_type.eq.client,entity_id.eq.${identity.clientId})`;
  const { data: activity } = await supabase
    .from("activity_log")
    .select("id, description, created_at")
    .or(entityFilter)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Activity" description="Everything that's happened on your account." />
      <div className="flex-1 px-8 py-6">
        {(activity ?? []).length === 0 ? (
          <EmptyState message="No activity yet." />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
            {(activity ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate">{a.description}</span>
                <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
