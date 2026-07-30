import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { History } from "lucide-react";
import { getCommunicationOutbox } from "@/features/notifications/queries";
import { CommunicationOutboxRow } from "@/features/notifications/communication-outbox-row";
import { OUTBOX_CHANNEL_LABELS } from "@/lib/validation/notifications";

export default async function CommunicationHistoryPage({ searchParams }: { searchParams: Promise<{ status?: string; channel?: string }> }) {
  const { status, channel } = await searchParams;
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

  const outbox = await getCommunicationOutbox(workspaceId, { status, channel });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Communication History</h1>
        <p className="text-sm text-muted-foreground mt-1">Every email, SMS, and portal message the workspace has sent, with delivery events.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant={!status ? "secondary" : "ghost"} size="sm">
          <Link href="/communication-history">All</Link>
        </Button>
        <Button asChild variant={status === "failed" ? "secondary" : "ghost"} size="sm">
          <Link href="/communication-history?status=failed">Failed deliveries</Link>
        </Button>
        {Object.entries(OUTBOX_CHANNEL_LABELS).map(([v, l]) => (
          <Button asChild key={v} variant={channel === v ? "secondary" : "ghost"} size="sm">
            <Link href={`/communication-history?channel=${v}${status ? `&status=${status}` : ""}`}>{l}</Link>
          </Button>
        ))}
      </div>

      {outbox.length === 0 ? (
        <EmptyState icon={History} title="No communication history yet" description="Sent emails, texts, and portal messages will show up here once providers are connected." />
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {outbox.map((item) => (
            <CommunicationOutboxRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
