import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ReviewQueueItem } from "./ReviewQueueItem";

export const dynamic = "force-dynamic";

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return "Client";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function ReviewQueuePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: shares } = await supabase
    .from("engagement_shares")
    .select(
      `id, status, decision_notes, created_at,
      shared_by_workspace:workspaces!case_shares_workspace_id_fkey(name),
      engagement:engagements(id, engagement_number, client:clients(client_type, first_name, last_name, business_name))`
    )
    .eq("shared_with_workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const { data: reviewActions } =
    (shares ?? []).length > 0
      ? await supabase
          .from("engagement_review_actions")
          .select("id, engagement_share_id, action, comment, created_at")
          .in(
            "engagement_share_id",
            (shares ?? []).map((s) => s.id)
          )
          .order("created_at", { ascending: false })
      : { data: [] as { id: string; engagement_share_id: string; action: string; comment: string | null; created_at: string }[] };

  const openShares = (shares ?? []).filter((s) => s.status === "pending" || s.status === "corrections_requested");
  const resolvedShares = (shares ?? []).filter((s) => !openShares.includes(s));

  return (
    <>
      <PageHeader title="Review Queue" description="Filings your connected PTINs have shared with you for approval." />
      <div className="flex-1 space-y-8 px-8 py-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Awaiting your review</h2>
          {openShares.length === 0 ? (
            <EmptyState message="Nothing waiting on your review." />
          ) : (
            <ul className="space-y-3">
              {openShares.map((s) => {
                const engagement = s.engagement as unknown as {
                  id: string;
                  engagement_number: string | null;
                  client: Parameters<typeof clientLabel>[0];
                } | null;
                return (
                  <ReviewQueueItem
                    key={s.id}
                    shareId={s.id}
                    status={s.status}
                    clientName={clientLabel(engagement?.client ?? null)}
                    engagementNumber={engagement?.engagement_number ?? null}
                    engagementId={engagement?.id ?? null}
                    fromWorkspaceName={(s.shared_by_workspace as unknown as { name: string } | null)?.name ?? "A connected PTIN"}
                    actions={(reviewActions ?? []).filter((r) => r.engagement_share_id === s.id)}
                  />
                );
              })}
            </ul>
          )}
        </section>

        {resolvedShares.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Past decisions</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {resolvedShares.map((s) => {
                const engagement = s.engagement as unknown as { id: string; engagement_number: string | null; client: Parameters<typeof clientLabel>[0] } | null;
                return (
                  <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate">
                        {clientLabel(engagement?.client ?? null)} {engagement?.engagement_number ? `-- ${engagement.engagement_number}` : ""}
                      </p>
                      <p className="text-xs text-muted">
                        From {(s.shared_by_workspace as unknown as { name: string } | null)?.name ?? "a connected PTIN"}
                      </p>
                    </div>
                    <span className="text-xs capitalize text-muted">{s.status.replace(/_/g, " ")}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
