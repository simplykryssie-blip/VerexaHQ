import Link from "next/link";
import { FileCheck2, ClipboardCheck, ListChecks, FileText, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { AutomationDecisionQueueItem, ReviewQueueItem } from "./ReviewQueueItem";
import { ReviewQueueClientChangeItem } from "./ReviewQueueClientChangeItem";
import { ReviewQueueDocumentItem } from "./ReviewQueueDocumentItem";
import { Badge } from "@/components/ui/Badge";
import { ENGAGEMENT_SHARE_STATUS_TONE } from "@/lib/engagementStatus";
import { buildEntityLabelMap } from "@/lib/documentEntityLabels";

export const dynamic = "force-dynamic";

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return "Client";
  if (c.client_type !== "individual" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function ReviewQueuePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canReviewShares } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "engagements.share",
  });
  const { data: canReviewOrganizers } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "organizers.review",
  });
  const { data: canReviewDocuments } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "documents.view",
  });

  const { data: completedDocumentRequests } = canReviewDocuments
    ? await supabase
        .from("document_requests")
        .select("id, title, entity_type, entity_id, updated_at")
        .eq("workspace_id", workspace.id)
        .eq("status", "completed")
        .is("reviewed_at", null)
        .order("updated_at", { ascending: false })
    : { data: [] as { id: string; title: string; entity_type: string; entity_id: string; updated_at: string }[] };

  const documentEntityLabels = await buildEntityLabelMap(supabase, completedDocumentRequests ?? []);

  // Leads submit their intake organizer before an engagement exists (the
  // New Tax Service Lead Enters CRM flow sends it, then waits for it back),
  // so this can't ride along with engagement_shares/pipeline stages below --
  // it's the only surface a submitted-but-not-yet-reviewed lead organizer
  // shows up on anywhere in the app.
  const { data: submittedOrganizers } = canReviewOrganizers
    ? await supabase
        .from("organizer_responses")
        .select("id, submitted_at, organizer_templates(name), clients(client_type, first_name, last_name, business_name)")
        .eq("workspace_id", workspace.id)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
    : { data: [] as { id: string; submitted_at: string | null; organizer_templates: { name: string } | null; clients: Parameters<typeof clientLabel>[0] }[] };

  // A response drops off the "Forms submitted" section above the
  // moment it's first reviewed (status moves past 'submitted'), but a
  // client can still respond to flagged/reopened questions on it long
  // after that -- this is the only other place that resurfaces it. Scoped
  // through organizer_information_requests.workspace_id since
  // organizer_information_request_items itself doesn't carry one.
  const { data: respondedItems } = canReviewOrganizers
    ? await supabase
        .from("organizer_information_request_items")
        .select("organizer_information_requests!inner(workspace_id, organizer_response_id)")
        .eq("status", "client_responded")
        .eq("organizer_information_requests.workspace_id", workspace.id)
    : { data: [] as { organizer_information_requests: { workspace_id: string; organizer_response_id: string } }[] };

  const respondedCountByResponseId = new Map<string, number>();
  for (const row of respondedItems ?? []) {
    const responseId = (row.organizer_information_requests as unknown as { organizer_response_id: string }).organizer_response_id;
    respondedCountByResponseId.set(responseId, (respondedCountByResponseId.get(responseId) ?? 0) + 1);
  }
  const respondedResponseIds = Array.from(respondedCountByResponseId.keys());

  const { data: respondedOrganizers } =
    respondedResponseIds.length > 0
      ? await supabase
          .from("organizer_responses")
          .select("id, organizer_templates(name), clients(client_type, first_name, last_name, business_name)")
          .in("id", respondedResponseIds)
      : { data: [] as { id: string; organizer_templates: { name: string } | null; clients: Parameters<typeof clientLabel>[0] }[] };

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

  const { data: pendingAutomationDecisions } = await supabase
    .from("automation_pending_steps")
    .select("id, run_id, automation_step_id, created_at")
    .eq("workspace_id", workspace.id)
    .eq("status", "pending_decision")
    .order("created_at", { ascending: false });

  const automationRunIds = Array.from(new Set((pendingAutomationDecisions ?? []).map((r) => r.run_id)));
  const automationStepIds = Array.from(new Set((pendingAutomationDecisions ?? []).map((r) => r.automation_step_id)));

  const [{ data: automationRuns }, { data: automationSteps }] = await Promise.all([
    automationRunIds.length
      ? supabase
          .from("automation_runs")
          .select("id, client_id, engagement_id")
          .eq("workspace_id", workspace.id)
          .in("id", automationRunIds)
      : Promise.resolve({ data: [] as { id: string; client_id: string | null; engagement_id: string | null }[] }),
    automationStepIds.length
      ? supabase
          .from("automation_steps")
          .select("id, display_name, action_type, action_config")
          .in("id", automationStepIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; action_type: string; action_config: Record<string, unknown> }[] }),
  ]);

  const automationClientIds = Array.from(new Set((automationRuns ?? []).map((r) => r.client_id).filter((v): v is string => Boolean(v))));
  const automationEngagementIds = Array.from(new Set((automationRuns ?? []).map((r) => r.engagement_id).filter((v): v is string => Boolean(v))));

  const [{ data: automationClients }, { data: automationEngagements }] = await Promise.all([
    automationClientIds.length
      ? supabase.from("clients").select("id, client_type, first_name, last_name, business_name").in("id", automationClientIds)
      : Promise.resolve({ data: [] as { id: string; client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }[] }),
    automationEngagementIds.length
      ? supabase.from("engagements").select("id, engagement_number").in("id", automationEngagementIds)
      : Promise.resolve({ data: [] as { id: string; engagement_number: string | null }[] }),
  ]);

  const automationRunById = new Map((automationRuns ?? []).map((r) => [r.id, r]));
  const automationStepById = new Map((automationSteps ?? []).map((s) => [s.id, s]));
  const automationClientById = new Map((automationClients ?? []).map((c) => [c.id, c]));
  const automationEngagementById = new Map((automationEngagements ?? []).map((e) => [e.id, e]));

  const reviewDecisionItems = (pendingAutomationDecisions ?? [])
    .map((p) => {
      const step = automationStepById.get(p.automation_step_id);
      if (!step || (step.action_config as Record<string, unknown> | null)?.decision_mode !== "review_queue") return null;
      const run = automationRunById.get(p.run_id);
      if (!run) return null;
      const client = run.client_id ? automationClientById.get(run.client_id) : null;
      const engagement = run.engagement_id ? automationEngagementById.get(run.engagement_id) : null;
      const options = Array.isArray((step.action_config as Record<string, unknown>).decision_options)
        ? ((step.action_config as Record<string, unknown>).decision_options as { key: string; label: string }[])
        : [];
      return {
        id: p.id,
        stepName: step.display_name ?? "Review Queue Decision",
        clientName: clientLabel(client ?? null),
        engagementNumber: engagement?.engagement_number ?? null,
        engagementId: engagement?.id ?? null,
        createdAt: p.created_at,
        options,
      };
    })
    .filter(Boolean) as {
      id: string;
      stepName: string;
      clientName: string;
      engagementNumber: string | null;
      engagementId: string | null;
      createdAt: string;
      options: { key: string; label: string }[];
    }[];

  const { data: pendingClientChanges } = await supabase
    .from("client_pending_changes")
    .select(
      "id, batch_id, client_id, target_table, target_column, old_value, new_value, new_value_last4, created_at, source, organizer_response_id, clients(client_type, first_name, last_name, business_name)"
    )
    .eq("workspace_id", workspace.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const clientChangeBatches = new Map<string, typeof pendingClientChanges>();
  for (const row of pendingClientChanges ?? []) {
    clientChangeBatches.set(row.batch_id, [...(clientChangeBatches.get(row.batch_id) ?? []), row]);
  }

  // Ties the two sections together -- an organizer submission that also
  // proposed profile changes (SSN, DOB, address...) shows up in both places;
  // each side gets a pointer to the other instead of looking unrelated.
  const organizerResponseIdsWithChanges = new Set(
    (pendingClientChanges ?? []).map((r) => r.organizer_response_id).filter((v): v is string => Boolean(v))
  );
  const organizerResponseIdByBatch = new Map(
    (pendingClientChanges ?? []).filter((r) => r.organizer_response_id).map((r) => [r.batch_id, r.organizer_response_id as string])
  );

  const totalPending =
    clientChangeBatches.size +
    (submittedOrganizers ?? []).length +
    (completedDocumentRequests ?? []).length +
    openShares.length +
    reviewDecisionItems.length;

  return (
    <>
      <PageHero
        icon={ClipboardCheck}
        tone="rose"
        heading={
          <>
            Your <HeroHighlight>review queue</HeroHighlight>.
          </>
        }
        subtitle={
          totalPending > 0
            ? `${totalPending} item${totalPending === 1 ? "" : "s"} waiting on your review.`
            : "Filings your connected PTINs have shared with you for approval, plus client-submitted info changes awaiting your OK."
        }
      />
      <div className="flex-1 space-y-8 px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <StatTile icon={FileText} tone="accent" label="Client info changes" value={clientChangeBatches.size} />
          <StatTile icon={ListChecks} tone="emerald" label="Forms submitted" value={(submittedOrganizers ?? []).length} />
          <StatTile icon={FileCheck2} tone="amber" label="Documents submitted" value={(completedDocumentRequests ?? []).length} />
          <StatTile icon={Share2} tone="violet" label="Shares awaiting review" value={openShares.length} />
        </div>
        {reviewDecisionItems.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Workflow review decisions</h2>
            <ul className="space-y-3">
              {reviewDecisionItems.map((item) => (
                <AutomationDecisionQueueItem
                  key={item.id}
                  pendingStepId={item.id}
                  stepName={item.stepName}
                  clientName={item.clientName}
                  engagementNumber={item.engagementNumber}
                  engagementId={item.engagementId}
                  createdAt={item.createdAt}
                  options={item.options}
                />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Client info changes</h2>
          {clientChangeBatches.size === 0 ? (
            <EmptyState message="No client-submitted changes waiting on your review." />
          ) : (
            <ul className="space-y-3">
              {Array.from(clientChangeBatches.entries()).map(([batchId, rows]) => (
                <ReviewQueueClientChangeItem
                  key={batchId}
                  batchId={batchId}
                  clientName={clientLabel((rows?.[0]?.clients as unknown as Parameters<typeof clientLabel>[0]) ?? null)}
                  clientId={rows?.[0]?.client_id ?? ""}
                  organizerResponseId={organizerResponseIdByBatch.get(batchId) ?? null}
                  changes={(rows ?? []).map((r) => ({
                    id: r.id,
                    targetTable: r.target_table,
                    targetColumn: r.target_column,
                    oldValue: r.old_value,
                    newValue: r.new_value,
                    newValueLast4: r.new_value_last4,
                  }))}
                />
              ))}
            </ul>
          )}
        </section>

        {canReviewOrganizers && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Forms submitted</h2>
            {(submittedOrganizers ?? []).length === 0 ? (
              <EmptyState message="No submitted forms waiting on your review." />
            ) : (
              <ul className="space-y-3">
                {(submittedOrganizers ?? []).map((o) => {
                  const name = clientLabel(o.clients as unknown as Parameters<typeof clientLabel>[0]);
                  const templateName = (o.organizer_templates as unknown as { name: string } | null)?.name ?? "Form";
                  const hasLinkedChanges = organizerResponseIdsWithChanges.has(o.id);
                  return (
                    <li key={o.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-soft">
                      <Avatar name={name} url={null} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{name}</p>
                        <p className="text-xs text-muted">
                          Submitted {templateName}
                          {o.submitted_at ? ` on ${new Date(o.submitted_at).toLocaleDateString()}` : ""}
                        </p>
                        {hasLinkedChanges && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-accent">
                            <FileCheck2 size={12} aria-hidden="true" /> Also proposed profile changes -- see Client info changes below
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/organizers/${o.id}/review`}
                        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
                      >
                        Review
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {canReviewOrganizers && (respondedOrganizers ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Form corrections responded to</h2>
            <ul className="space-y-3">
              {(respondedOrganizers ?? []).map((o) => {
                const name = clientLabel(o.clients as unknown as Parameters<typeof clientLabel>[0]);
                const templateName = (o.organizer_templates as unknown as { name: string } | null)?.name ?? "Form";
                const count = respondedCountByResponseId.get(o.id) ?? 0;
                return (
                  <li key={o.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-soft">
                    <Avatar name={name} url={null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{name}</p>
                      <p className="text-xs text-muted">
                        Responded to {count} flagged {count === 1 ? "question" : "questions"} on {templateName}
                      </p>
                    </div>
                    <Link
                      href={`/organizers/${o.id}/review`}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
                    >
                      Review
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {canReviewDocuments && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Documents submitted</h2>
            {(completedDocumentRequests ?? []).length === 0 ? (
              <EmptyState message="No completed document requests waiting on your review." />
            ) : (
              <ul className="space-y-3">
                {(completedDocumentRequests ?? []).map((r) => {
                  const entity = documentEntityLabels.get(`${r.entity_type}:${r.entity_id}`);
                  return (
                    <ReviewQueueDocumentItem
                      key={r.id}
                      documentRequestId={r.id}
                      title={r.title}
                      entityLabel={entity?.label ?? "Client"}
                      entityHref={entity?.href ?? "#"}
                      completedAt={r.updated_at}
                    />
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {canReviewShares && (
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
        )}

        {canReviewShares && resolvedShares.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Past decisions</h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
              {resolvedShares.map((s) => {
                const engagement = s.engagement as unknown as { id: string; engagement_number: string | null; client: Parameters<typeof clientLabel>[0] } | null;
                return (
                  <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-surfaceMuted">
                    <div>
                      <p className="font-medium text-slate">
                        {clientLabel(engagement?.client ?? null)} {engagement?.engagement_number ? `-- ${engagement.engagement_number}` : ""}
                      </p>
                      <p className="text-xs text-muted">
                        From {(s.shared_by_workspace as unknown as { name: string } | null)?.name ?? "a connected PTIN"}
                      </p>
                    </div>
                    <Badge tone={ENGAGEMENT_SHARE_STATUS_TONE[s.status] ?? "neutral"} className="capitalize">
                      {s.status.replace(/_/g, " ")}
                    </Badge>
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
