"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Eye, EyeOff, ArrowUp, ArrowDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { PrioritiesWidget } from "@/components/widgets/PrioritiesWidget";
import { QuickActionsWidget, type QuickActionPermissions } from "@/components/widgets/QuickActionsWidget";
import { CalendarWidget } from "@/components/widgets/CalendarWidget";
import { RecentActivityWidget } from "@/components/widgets/RecentActivityWidget";
import { ReviewQueueWidget } from "@/components/widgets/ReviewQueueWidget";
import { WidgetShell } from "@/components/widgets/WidgetShell";
import { useToast } from "@/components/Toast";
import { OnboardingChecklist, type OnboardingStep } from "@/components/onboarding/OnboardingChecklist";
import type { DashboardData } from "@/lib/dashboard/data";
import type { PriorityItem } from "@/lib/dashboard/priorities";
import { isWidgetType, type WidgetType } from "@/lib/dashboard/widgets";

export type WidgetRow = { id: string; widget_type: string; title: string | null; display_order: number; is_visible: boolean };

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DashboardShell({
  workspaceName,
  isAdmin,
  widgets,
  data,
  priorities,
  quickActionPermissions,
  workspaceId,
  onboardingSteps,
}: {
  workspaceName: string;
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
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState(widgets);
  const [customizing, setCustomizing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

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

  async function move(row: WidgetRow, direction: -1 | 1) {
    const idx = sorted.findIndex((r) => r.id === row.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;

    setSaving(row.id);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === row.id) return { ...r, display_order: swapWith.display_order };
        if (r.id === swapWith.id) return { ...r, display_order: row.display_order };
        return r;
      })
    );
    await Promise.all([
      savePreference(row.id, { display_order: swapWith.display_order }),
      savePreference(swapWith.id, { display_order: row.display_order }),
    ]);
    setSaving(null);
    router.refresh();
  }

  function renderWidget(type: WidgetType) {
    switch (type) {
      case "revenue":
        return <KpiWidget title="Revenue This Month" value={money(data.kpis.revenueThisMonth)} reportHref="/reports/financial" />;
      case "kpis":
        return (
          <WidgetShell title="Engagements & Tasks">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Open Engagements</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{data.kpis.openEngagements}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Tasks Due Today</p>
                <p className={`mt-1 text-2xl font-semibold ${data.kpis.tasksDueToday > 0 ? "text-warning" : "text-ink"}`}>
                  {data.kpis.tasksDueToday}
                </p>
              </div>
            </div>
          </WidgetShell>
        );
      case "collections":
        return (
          <KpiWidget
            title="Outstanding Invoices"
            value={money(data.kpis.outstandingInvoicesTotal)}
            tone={data.kpis.outstandingInvoicesCount > 0 ? "warning" : "default"}
            reportHref="/reports/financial?filter=outstanding"
          />
        );
      case "missing_documents":
        return (
          <KpiWidget
            title="Missing Documents"
            value={String(data.kpis.missingDocumentsCount)}
            tone={data.kpis.missingDocumentsCount > 0 ? "warning" : "default"}
            reportHref="/reports/documents"
          />
        );
      case "messages":
        return <KpiWidget title="Open Client Messages" value={String(data.kpis.openClientMessages)} />;
      case "todays_work":
        return <PrioritiesWidget items={priorities} />;
      case "review_queue":
        return <ReviewQueueWidget items={data.reviewItems} />;
      case "quick_actions":
        return <QuickActionsWidget permissions={{ ...quickActionPermissions, isAdmin }} />;
      case "calendar":
        return <CalendarWidget items={data.calendarItems} />;
      case "recent_activity":
        return <RecentActivityWidget items={data.recentActivity} />;
      default:
        return null;
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back to ${workspaceName}.`}
        actions={
          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            aria-pressed={customizing}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              customizing ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:border-accent hover:text-accent"
            }`}
          >
            <Settings2 size={14} aria-hidden="true" /> {customizing ? "Done" : "Customize"}
          </button>
        }
      />

      <div className="flex-1 px-8 py-6">
        {onboardingSteps && onboardingSteps.length > 0 && (
          <OnboardingChecklist workspaceId={workspaceId} steps={onboardingSteps} canDismiss={isAdmin} />
        )}

        {customizing && (
          <div className="mb-4 rounded-xl border border-border bg-surfaceMuted p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Widget layout</h2>
            <ul className="mt-2 divide-y divide-border">
              {sorted.map((row, i) => (
                <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                  <span className={row.is_visible ? "text-slate" : "text-muted line-through"}>{row.title ?? row.widget_type}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={i === 0 || saving === row.id}
                      onClick={() => move(row, -1)}
                      aria-label={`Move ${row.title ?? row.widget_type} up`}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={i === sorted.length - 1 || saving === row.id}
                      onClick={() => move(row, 1)}
                      aria-label={`Move ${row.title ?? row.widget_type} down`}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={saving === row.id}
                      onClick={() => toggleVisible(row)}
                      aria-label={row.is_visible ? `Hide ${row.title ?? row.widget_type}` : `Show ${row.title ?? row.widget_type}`}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                    >
                      {row.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row) => (isWidgetType(row.widget_type) ? <div key={row.id}>{renderWidget(row.widget_type)}</div> : null))}
        </div>
      </div>
    </>
  );
}
