import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ArrowRight, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE, CONNECTED_CHILD_TIER_LABEL } from "@/lib/firmConnections";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { AddManualFirmModal } from "@/components/firms/AddManualFirmModal";
import {
  deriveWaitingOn,
  ONBOARDING_STATUS_TONE,
  ONBOARDING_STATUS_LABEL,
  MANUAL_ONBOARDING_STAGE_LABEL,
  type PartnerOnboardingRow,
} from "@/lib/partnerOnboarding";

export const dynamic = "force-dynamic";

const MANUAL_STAGES = ["invited", "agreement_signed", "software_provisioned", "live"];

// Firms connected to this workspace, as their own first-class section --
// separate from Clients, since a connected firm is a whole other workspace
// with its own clients/engagements/staff underneath it, not a client
// record. Only relevant for a workspace that can have firms connected
// under it (see isEroManagementTier()) -- Service Bureau gets exactly the
// same access as an ERO here, since it's the same capability tier, just
// bigger.
export default async function FirmsPage({
  searchParams,
}: {
  /** Optional deep-link from the Service Bureau Network Command Center --
   *  "pending" shows active connections that haven't reached "live" yet.
   *  Absent (the normal case, arriving from this page's own nav item)
   *  shows every connected firm exactly as before. */
  searchParams: { onboarding?: string };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  if (!isEroManagementTier(workspace)) redirect("/dashboard");

  const supabase = createClient();
  // Same permission Settings > Users & Staff already requires before it
  // shows this same connected-firms data (including, on the detail page,
  // real payout/production financials) -- this standalone page shouldn't
  // be a second, unguarded door to it.
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "firm_connections.manage" });
  if (!canView) {
    return (
      <>
        <PageHero
          icon={Building2}
          tone="accent"
          heading={
            <>
              Your <HeroHighlight>connected firms</HeroHighlight>.
            </>
          }
          subtitle="Firms connected to you -- their info, production, package, and payout ledger."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You don't have permission to view connected firms." />
        </div>
      </>
    );
  }

  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];

  const [{ data: connectedFirms }, { data: onboardings }] = await Promise.all([
    childRelationshipTypes.length
      ? supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id, p_relationship_types: childRelationshipTypes })
      : Promise.resolve({ data: [] as never[] }),
    // One batched call for every connection's onboarding record -- avoids a
    // query per firm card. Purely additive alongside the existing
    // onboarding_stage filter below, which is left untouched (Phase 6C audit
    // section 28: the two systems are not reconciled yet).
    supabase.rpc("list_partner_onboardings", { p_workspace_id: workspace.id }),
  ]);
  const onboardingByConnectionId = new Map((onboardings ?? []).map((o) => [o.firm_connection_id, o as PartnerOnboardingRow & { firm_connection_id: string }]));

  const allFirms = connectedFirms ?? [];

  // Population-aware filtering (Phase 6E): onboarding_stage is only ever
  // authoritative for a manual/external firm (source='manual'); a
  // VerexaHQ-workspace partner's (child_workspace_id set) real lifecycle is
  // partner_onboardings.status, read from the already-fetched
  // onboardingByConnectionId map. A not-yet-redeemed invite has no
  // onboarding lifecycle at all and is never matched by any onboarding
  // filter -- it's a connection-invitation fact, not an onboarding fact.
  const rawFilter = searchParams.onboarding;
  const manualStageFilter = rawFilter && MANUAL_STAGES.includes(rawFilter.replace(/^manual_/, "")) ? rawFilter.replace(/^manual_/, "") : null;
  const partnerStatusFilter = rawFilter?.startsWith("partner_") ? rawFilter.slice("partner_".length) : null;

  const firms =
    rawFilter === "pending"
      ? allFirms.filter((f) => {
          if (f.status !== "active") return false;
          if (f.child_workspace_id) {
            const status = onboardingByConnectionId.get(f.connection_id)?.status;
            return Boolean(status) && !["ready", "rejected", "withdrawn"].includes(status!);
          }
          return f.source === "manual" && f.onboarding_stage !== "live";
        })
      : manualStageFilter
        ? allFirms.filter((f) => f.status === "active" && f.source === "manual" && f.onboarding_stage === manualStageFilter)
        : partnerStatusFilter
          ? allFirms.filter((f) => f.status === "active" && f.child_workspace_id && onboardingByConnectionId.get(f.connection_id)?.status === partnerStatusFilter)
          : allFirms;
  const activeCount = firms.filter((f) => f.status === "active").length;
  const eroCount = firms.filter((f) => CONNECTED_CHILD_TIER_LABEL[f.relationship_type] === "ERO").length;
  const ptinCount = firms.filter((f) => CONNECTED_CHILD_TIER_LABEL[f.relationship_type] === "PTIN").length;

  return (
    <>
      <PageHero
        icon={Building2}
        tone="accent"
        heading={
          <>
            Your <HeroHighlight>connected firms</HeroHighlight>.
          </>
        }
        subtitle="Firms connected to you -- their info, production, package, and payout ledger."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <StatTile icon={Building2} tone="accent" label="Connected firms" value={firms.length} />
          <StatTile icon={Building2} tone="emerald" label="Active" value={activeCount} />
          <StatTile icon={Building2} tone="violet" label="EROs" value={eroCount} />
          <StatTile icon={Building2} tone="amber" label="PTINs" value={ptinCount} />
        </div>
        {searchParams.onboarding && (
          <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accentSoft px-4 py-2 text-xs text-accent">
            <span>
              {rawFilter === "pending"
                ? "Showing active connections still onboarding -- not yet ready (VerexaHQ-workspace partners) or live (manual/external firms)."
                : manualStageFilter
                  ? `Showing manual/external firms at stage "${manualStageFilter.replace(/_/g, " ")}".`
                  : partnerStatusFilter
                    ? `Showing VerexaHQ-workspace partners at onboarding status "${partnerStatusFilter.replace(/_/g, " ")}".`
                    : `Showing connections matching "${rawFilter?.replace(/_/g, " ")}".`}
            </span>
            <Link href="/firms" className="font-medium underline">
              Clear filter
            </Link>
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            A firm on VerexaHQ connects by invite (Settings &gt; Users &amp; Staff). A firm that isn&apos;t on VerexaHQ can be added here directly.
          </p>
          {childRelationshipTypes.length > 0 && <AddManualFirmModal workspaceId={workspace.id} availableRelationshipTypes={childRelationshipTypes} />}
        </div>
        {firms.length === 0 ? (
          <EmptyState
            message={
              searchParams.onboarding
                ? "No active connections match this filter."
                : "No firms connected yet. Invite one from Settings > Users & Staff, or add one manually above."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {firms.map((f) => {
              const onboarding = onboardingByConnectionId.get(f.connection_id);
              const waiting = onboarding ? deriveWaitingOn(onboarding) : null;
              return (
                <Link
                  key={f.connection_id}
                  href={`/firms/${f.connection_id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:shadow-softHover"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
                      <Building2 size={16} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-medium text-slate">{f.name}</p>
                      <p className="text-xs text-muted">{CONNECTED_CHILD_TIER_LABEL[f.relationship_type] ?? "Firm"}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={f.status === "active" ? "success" : "neutral"}>{f.status}</Badge>
                      {f.source === "manual" && <Badge tone="neutral">Manual</Badge>}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                      View <ArrowRight size={12} aria-hidden="true" />
                    </span>
                  </div>
                  {onboarding && waiting && onboarding.status !== "ready" && (
                    <div className="flex items-center gap-1.5 border-t border-border pt-2">
                      <Badge tone={ONBOARDING_STATUS_TONE[onboarding.status] ?? "neutral"}>{ONBOARDING_STATUS_LABEL[onboarding.status] ?? onboarding.status}</Badge>
                      <span className="truncate text-[11px] text-muted">{waiting.label}</span>
                    </div>
                  )}
                  {/* Manual/external firms have no partner_onboardings record --
                      onboarding_stage is their only progress signal, shown the
                      same way, so they aren't silently left with no onboarding
                      badge at all (Phase 6E). */}
                  {f.source === "manual" && f.onboarding_stage && f.onboarding_stage !== "live" && (
                    <div className="flex items-center gap-1.5 border-t border-border pt-2">
                      <Badge tone="neutral">{MANUAL_ONBOARDING_STAGE_LABEL[f.onboarding_stage] ?? f.onboarding_stage}</Badge>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
