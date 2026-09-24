"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Settings2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  DollarSign,
  Briefcase,
  Receipt,
  FileWarning,
  MessageSquare,
  ListChecks,
  LayoutDashboard,
  UserX,
  Clock,
  CalendarCheck,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { SortableWidgetCard } from "@/components/dashboard/SortableWidgetCard";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { NewClientButton, type ServiceCategory, type StaffOption } from "@/app/(app)/clients/NewClientButton";
import { KpiWidget, type KpiTrend } from "@/components/widgets/KpiWidget";
import { PrioritiesWidget } from "@/components/widgets/PrioritiesWidget";
import { QuickActionsWidget, type QuickActionPermissions } from "@/components/widgets/QuickActionsWidget";
import { RecentActivityWidget } from "@/components/widgets/RecentActivityWidget";
import { ReviewQueueWidget } from "@/components/widgets/ReviewQueueWidget";
import { TopServicesWidget } from "@/components/widgets/TopServicesWidget";
import { DeadlineRiskWidget } from "@/components/widgets/DeadlineRiskWidget";
import { WidgetShell } from "@/components/widgets/WidgetShell";
import { EmptyState } from "@/components/widgets/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Donut } from "@/components/widgets/Donut";
import { IconChip } from "@/components/ui/IconChip";
import { PromoBanner } from "@/components/dashboard/PromoBanner";
import { FreshnessBadge } from "@/components/dashboard/FreshnessBadge";
import { useToast } from "@/components/Toast";
import { OnboardingChecklist, type OnboardingStep } from "@/components/onboarding/OnboardingChecklist";
import type { DashboardData } from "@/lib/dashboard/data";
import type { PriorityItem } from "@/lib/dashboard/priorities";
import { isWidgetType, WIDE_WIDGET_TYPES, WIDGET_SECTIONS, type WidgetType } from "@/lib/dashboard/widgets";

export type WidgetRow = { id: string; widget_type: string; title: string | null; display_order: number; is_visible: boolean };

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Real percentage change only -- returns undefined (no trend shown) rather
// than a fabricated number when there's no honest baseline to compare against
// (equal values, or a previous value of zero where "% change" is undefined).
function trendFor(current: number, previous: number, suffix: string, sentiment?: "positive" | "negative"): KpiTrend | undefined {
  if (previous <= 0 || current === previous) return undefined;
  const pct = Math.round((Math.abs(current - previous) / previous) * 100);
  return { direction: current > previous ? "up" : "down", label: `${pct}% ${suffix}`, sentiment };
}

export function DashboardShell({
  workspaceName,
  generatedAt,
  greetingName,
  isAdmin,
  widgets,
  data,
  priorities,
  quickActionPermissions,
  workspaceId,
  onboardingSteps,
  seenOnboardingSteps,
  serviceCategories,
  staffOptions,
  accountHolderName,
  defaultWidgets,
}: {
  workspaceName: string;
  /** ISO timestamp taken at the start of this server render -- see
   *  FreshnessBadge for why the display formatting happens client-side. */
  generatedAt: string;
  /** For the greeting hero -- the same display_name shown in the sidebar, so
   *  the two never disagree. Null falls back to the workspace name so a
   *  staff member who hasn't set one yet still gets a real greeting. */
  greetingName: string | null;
  /** Only gates the "Invite Staff" quick action (see quickActionPermissions
   *  below) -- widget visibility/order stays per-user (user_widget_preferences),
   *  not admin-only. */
  isAdmin: boolean;
  widgets: WidgetRow[];
  data: DashboardData;
  priorities: PriorityItem[];
  quickActionPermissions: Omit<QuickActionPermissions, "isAdmin">;
  workspaceId: string;
  /** null once dismissed or already computed away -- render nothing. */
  onboardingSteps: OnboardingStep[] | null;
  seenOnboardingSteps: string[];
  /** Passed straight through to the "Add Client" CTA's NewClientButton --
   *  same shape/source that Contacts' own NewClientButton uses. */
  serviceCategories: ServiceCategory[];
  staffOptions: StaffOption[];
  accountHolderName: string;
  /** The workspace's own dashboard_widgets defaults, before this user's
   *  user_widget_preferences overrides are merged in -- kept separate so
   *  "Reset Layout" can restore them instantly client-side without a
   *  round trip, then persists the reset by deleting this user's override
   *  rows (see resetLayout below). */
  defaultWidgets: WidgetRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState(widgets);
  const [customizing, setCustomizing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sorted = [...rows].sort((a, b) => a.display_order - b.display_order);
  const visible = sorted.filter((w) => w.is_visible);

  async function savePreference(dashboardWidgetId: string, patch: { is_visible?: boolean; display_order?: number }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: new Error("Not signed in") };
    return supabase
      .from("user_widget_preferences")
      .upsert({ user_id: user.id, dashboard_widget_id: dashboardWidgetId, ...patch }, { onConflict: "user_id,dashboard_widget_id" });
  }

  async function toggleVisible(row: WidgetRow) {
    setSaving(row.id);
    const nextVisible = !row.is_visible;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_visible: nextVisible } : r)));
    const { error } = await savePreference(row.id, { is_visible: nextVisible });
    setSaving(null);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_visible: row.is_visible } : r)));
      toast.show(error.message, "error");
      return;
    }
    toast.show(nextVisible ? "Widget shown" : "Widget hidden", "success");
    router.refresh();
  }

  // Drag-to-reorder replaces the old up/down buttons -- dropping a widget
  // anywhere in the list moves it there directly instead of one step at a
  // time. Reassigns every row's display_order sequentially (not just the
  // two that swapped) since a drop can move an item across several
  // positions in one gesture.
  async function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const current = [...sorted];
    const fromIndex = current.findIndex((r) => r.id === draggedId);
    const toIndex = current.findIndex((r) => r.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    const reindexed = current.map((r, i) => ({ ...r, display_order: i }));

    setSaving(draggedId);
    setRows((prev) => prev.map((r) => reindexed.find((x) => x.id === r.id) ?? r));
    await Promise.all(reindexed.map((r) => savePreference(r.id, { display_order: r.display_order })));
    setSaving(null);
    router.refresh();
  }

  // dnd-kit fires this once per completed drag, scoped to whichever
  // section's own SortableContext the drag happened in -- `over` can only
  // ever be a sibling already in that same section (see SortableWidgetCard),
  // so this always reduces to the existing two-id reorder.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void reorder(String(active.id), String(over.id));
  }

  // Deletes this user's saved overrides for every widget on this dashboard
  // so the merge in page.tsx falls back to dashboard_widgets' own defaults
  // next render (the same fallback a brand-new user already gets) --
  // restores default order and visibility together, without a second
  // storage mechanism or a broader RPC grant than the RLS policies already
  // allow a user over their own rows.
  async function resetLayout() {
    setSaving("__reset__");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from("user_widget_preferences")
        .delete()
        .eq("user_id", user.id)
        .in("dashboard_widget_id", rows.map((r) => r.id));
      if (error) {
        setSaving(null);
        toast.show(error.message, "error");
        return;
      }
    }
    setRows(defaultWidgets);
    setSaving(null);
    toast.show("Layout reset to default", "success");
    router.refresh();
  }

  function renderWidget(type: WidgetType) {
    switch (type) {
      case "revenue":
        return (
          <KpiWidget
            title="Revenue This Month"
            value={money(data.kpis.revenueThisMonth)}
            icon={DollarSign}
            chip="emerald"
            reportHref="/billing"
            trend={trendFor(data.kpis.revenueThisMonth, data.kpis.revenueLastMonth, "vs last month")}
          />
        );
      case "kpis":
        // "Engagements" -- Open + Unassigned counts, each linking straight to
        // the existing filtered list that already has the full itemized
        // detail (no inline list here, so this stays a compact stat card
        // rather than duplicating /engagements and /assignments).
        return (
          <WidgetShell title="Engagements" reportHref="/engagements" reportLabel="View Engagements">
            <div className="grid grid-cols-2 gap-3">
              <Link href="/engagements?status=open" className="block rounded-lg -m-1 p-1 transition hover:bg-surfaceMuted">
                <IconChip tone="accent" className="mb-3">
                  <Briefcase size={17} aria-hidden="true" />
                </IconChip>
                <p className="text-xs uppercase tracking-wide text-muted">Open</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">{data.kpis.openEngagements}</p>
              </Link>
              <Link
                href="/assignments?tab=engagements&filter=unassigned"
                className="block rounded-lg -m-1 p-1 transition hover:bg-surfaceMuted"
              >
                <IconChip tone="rose" className="mb-3">
                  <UserX size={17} aria-hidden="true" />
                </IconChip>
                <p className="text-xs uppercase tracking-wide text-muted">Unassigned</p>
                <p
                  className={`mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight ${data.unassignedEngagements.length > 0 ? "text-warning" : "text-ink"}`}
                >
                  {data.unassignedEngagements.length}
                </p>
              </Link>
            </div>
          </WidgetShell>
        );
      case "collections":
        return (
          <KpiWidget
            title="Outstanding Invoices"
            value={money(data.kpis.outstandingInvoicesTotal)}
            tone={data.kpis.outstandingInvoicesCount > 0 ? "warning" : "default"}
            icon={Receipt}
            chip="rose"
            reportHref="/billing?filter=unpaid"
          />
        );
      case "missing_documents": {
        // "Client Requests" -- Missing Documents + Overdue Requests counts,
        // plus the overdue list itself (that list's per-item detail --
        // which client, which request, how overdue -- has no other home on
        // the dashboard, unlike the plain Missing Documents count it's
        // joined with, so it stays inline rather than being dropped).
        const overdue = data.overdueRequests;
        return (
          <WidgetShell
            title="Client Requests"
            reportHref="/reports/documents?report=missing"
            reportLabel="View Documents"
            action={
              overdue.length > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
                  {overdue.length}
                </span>
              ) : undefined
            }
          >
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <IconChip tone="amber" className="mb-3">
                  <FileWarning size={17} aria-hidden="true" />
                </IconChip>
                <p className="text-xs uppercase tracking-wide text-muted">Missing Documents</p>
                <p
                  className={`mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight ${data.kpis.missingDocumentsCount > 0 ? "text-warning" : "text-ink"}`}
                >
                  {data.kpis.missingDocumentsCount}
                </p>
              </div>
              <div>
                <IconChip tone="rose" className="mb-3">
                  <Clock size={17} aria-hidden="true" />
                </IconChip>
                <p className="text-xs uppercase tracking-wide text-muted">Overdue Requests</p>
                <p
                  className={`mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight ${overdue.length > 0 ? "text-danger" : "text-ink"}`}
                >
                  {overdue.length}
                </p>
              </div>
            </div>
            {overdue.length > 0 && (
              <ul className="space-y-2 border-t border-border pt-3">
                {overdue.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <Clock size={16} className="shrink-0 text-danger" aria-hidden="true" />
                    <Link href={item.entityHref} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-sm font-medium text-ink">{item.entityLabel}</p>
                      <p className="truncate text-xs text-muted">{item.title}</p>
                    </Link>
                    <Badge tone="danger" className="shrink-0">
                      {Math.round((Date.now() - new Date(item.due_date).getTime()) / (24 * 60 * 60 * 1000))}d overdue
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </WidgetShell>
        );
      }
      case "messages":
        return <KpiWidget title="Open Client Messages" value={String(data.kpis.openClientMessages)} icon={MessageSquare} chip="violet" />;
      case "todays_work":
        return <PrioritiesWidget items={priorities} />;
      case "review_queue":
        return <ReviewQueueWidget items={data.reviewItems} />;
      case "quick_actions":
        return <QuickActionsWidget permissions={{ ...quickActionPermissions, isAdmin }} />;
      case "calendar": {
        // "Today" -- Tasks Due Today count (no dedicated task-list route
        // exists to link it to, same as before this consolidation) plus the
        // full existing calendar-items list, so nothing that used to be on
        // the standalone Calendar card is dropped.
        const upcoming = data.calendarItems.slice(0, 6);
        return (
          <WidgetShell title="Today" reportHref="/calendar" reportLabel="View Calendar">
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-surfaceMuted px-3 py-2.5">
              <IconChip tone="amber">
                <ListChecks size={17} aria-hidden="true" />
              </IconChip>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted">Tasks Due Today</p>
                <p
                  className={`font-display text-xl font-semibold tabular-nums tracking-tight ${data.kpis.tasksDueToday > 0 ? "text-warning" : "text-ink"}`}
                >
                  {data.kpis.tasksDueToday}
                </p>
              </div>
              {(() => {
                const trend = trendFor(
                  data.kpis.tasksDueToday,
                  data.kpis.tasksDueYesterday,
                  "vs yesterday",
                  data.kpis.tasksDueToday < data.kpis.tasksDueYesterday ? "positive" : "negative"
                );
                if (!trend) return null;
                const Icon = trend.direction === "up" ? ArrowUp : ArrowDown;
                return (
                  <p className={`flex shrink-0 items-center gap-1 text-xs font-medium ${trend.sentiment === "positive" ? "text-success" : "text-danger"}`}>
                    <Icon size={12} aria-hidden="true" />
                    {trend.label}
                  </p>
                );
              })()}
            </div>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarCheck} message="No upcoming deadlines." />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((item) => {
                  const content = (
                    <>
                      <span className="text-slate">{item.label}</span>
                      <span className="text-xs text-muted">{new Date(item.date).toLocaleDateString()}</span>
                    </>
                  );
                  return (
                    <li key={item.id} className="flex items-center justify-between text-sm">
                      {item.href ? (
                        <Link href={item.href} className="flex w-full items-center justify-between hover:underline">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex w-full items-center justify-between">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </WidgetShell>
        );
      }
      case "recent_activity":
        return <RecentActivityWidget items={data.recentActivity} />;
      case "top_services":
        return <TopServicesWidget services={data.topServices} />;
      case "engagement_pipeline": {
        // "Engagement Pipeline" -- the per-stage progress list plus the
        // former Stage Breakdown donut, both reading the same
        // data.engagementPipeline the two source widgets already shared, so
        // this consolidation runs zero additional queries.
        const stages = data.engagementPipeline;
        const total = stages.reduce((sum, s) => sum + s.count, 0);
        const max = Math.max(...stages.map((s) => s.count), 1);
        const busiestStatus = stages
          .filter((s) => s.status !== "Completed" && s.count > 0)
          .reduce<(typeof stages)[number] | null>((m, s) => (!m || s.count > m.count ? s : m), null)?.status;

        const active = stages.filter((s) => s.status !== "Completed" && s.count > 0).sort((a, b) => b.count - a.count);
        const activeTotal = active.reduce((sum, s) => sum + s.count, 0);
        const MAX_SEGMENTS = 4;
        const top = active.slice(0, MAX_SEGMENTS);
        const otherCount = active.slice(MAX_SEGMENTS).reduce((sum, s) => sum + s.count, 0);
        const segments = (otherCount > 0 ? [...top, { status: "Other", count: otherCount }] : top).map((s) => ({
          id: s.status,
          label: s.status,
          count: s.count,
        }));

        return (
          <WidgetShell title="Engagement Pipeline" reportHref="/engagements" reportLabel="View Full Pipeline">
            {total === 0 ? (
              <EmptyState icon={WorkflowIcon} message="No engagements yet." />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ul className="space-y-2">
                  {stages.map((stage) => (
                    <li key={stage.status} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-xs font-medium text-muted">{stage.status}</span>
                      <ProgressBar percent={(stage.count / max) * 100} tone={stage.status === busiestStatus ? "gradient" : "accent"} size="sm" />
                      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">{stage.count || "-"}</span>
                    </li>
                  ))}
                </ul>
                {activeTotal > 0 ? (
                  <Donut segments={segments} centerLabel={String(activeTotal)} centerSublabel="Active" />
                ) : (
                  <EmptyState icon={WorkflowIcon} message="No active engagements right now." />
                )}
              </div>
            )}
          </WidgetShell>
        );
      }
      case "deadline_risk":
        return <DeadlineRiskWidget items={data.deadlineRisk} />;
      default:
        return null;
    }
  }

  const resolvedGreetingName = greetingName ?? workspaceName;
  const urgentCount = priorities.length;
  const heroSub =
    urgentCount > 0
      ? `${urgentCount} thing${urgentCount === 1 ? "" : "s"} need${urgentCount === 1 ? "s" : ""} your attention today.`
      : "Nothing urgent today -- you're caught up.";

  return (
    <>
      <PageHero
        icon={LayoutDashboard}
        heading={
          <>
            Welcome back, <HeroHighlight>{resolvedGreetingName}</HeroHighlight>.
          </>
        }
        subtitle={heroSub}
        meta={<FreshnessBadge generatedAt={generatedAt} />}
        actions={
          <>
            {customizing && (
              <Button type="button" variant="secondary" size="sm" disabled={saving !== null} onClick={() => void resetLayout()}>
                <RotateCcw size={14} aria-hidden="true" /> Reset Layout
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              active={customizing}
              onClick={() => setCustomizing((v) => !v)}
              aria-pressed={customizing}
            >
              <Settings2 size={14} aria-hidden="true" /> {customizing ? "Done" : "Customize"}
            </Button>
            {quickActionPermissions.clientsCreate && (
              <NewClientButton
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                serviceCategories={serviceCategories}
                isOwner={isAdmin}
                staffOptions={staffOptions}
                accountHolderName={accountHolderName}
                triggerLabel="Add Client"
                triggerSize="sm"
              />
            )}
          </>
        }
      />

      <div className="flex-1 px-8 py-6">
        {onboardingSteps && onboardingSteps.length > 0 && (
          <OnboardingChecklist
            workspaceId={workspaceId}
            steps={onboardingSteps}
            canDismiss={isAdmin}
            seenSteps={seenOnboardingSteps}
          />
        )}

        <PromoBanner />

        {customizing && (
          <p className="mb-4 text-xs text-muted">
            Drag a card&apos;s grip handle to reorder it within its section, or use the eye icon to show/hide it. Changes save
            automatically.
          </p>
        )}

        <div className="space-y-8">
          {WIDGET_SECTIONS.map((section) => {
            // In Customize mode, hidden widgets stay visible (dimmed, via
            // SortableWidgetCard) so there's a way to re-show them -- outside
            // Customize mode, only `visible` renders, same as before.
            const sectionRows = (customizing ? sorted : visible).filter(
              (row) => isWidgetType(row.widget_type) && section.types.includes(row.widget_type)
            );
            if (sectionRows.length === 0) return null;
            return (
              <div key={section.label}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{section.label}</h2>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={sectionRows.map((r) => r.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {sectionRows.map((row) =>
                        isWidgetType(row.widget_type) ? (
                          <div
                            key={row.id}
                            className={`${WIDE_WIDGET_TYPES.has(row.widget_type) ? "sm:col-span-2 lg:col-span-3" : ""} ${
                              customizing && !row.is_visible ? "opacity-40" : ""
                            }`}
                          >
                            <SortableWidgetCard
                              id={row.id}
                              title={row.title ?? row.widget_type}
                              isVisible={row.is_visible}
                              editing={customizing}
                              saving={saving === row.id}
                              onToggleVisible={() => toggleVisible(row)}
                            >
                              {renderWidget(row.widget_type)}
                            </SortableWidgetCard>
                          </div>
                        ) : null
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
