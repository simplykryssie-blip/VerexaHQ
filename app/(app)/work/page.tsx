"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import StatusPill from "@/components/StatusPill";
import type { Deadline, EngagementWorkspace, Service, Task } from "@/lib/types";
import { isOpenTaskStatus, nextEngagementAction } from "@/lib/status";
import { humanizeServiceType } from "@/lib/serviceLabels";

const VIEWS = [
  { key: "mine", label: "My Work" },
  { key: "team", label: "Team Work" },
  { key: "workspaces", label: "Service Workspaces" },
  { key: "recurring", label: "Recurring Work" },
  { key: "review", label: "Review Queue" },
  { key: "due", label: "Due-Date View" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

type QueueTask = {
  id: string;
  task_title: string;
  task_status: string;
  priority: string;
  due_date: string | null;
  client_id: string;
  client_name: string;
  service_id: string | null;
  assigned_to: string | null;
};

type DueItem = {
  id: string;
  kind: "Task" | "Deadline" | "Service Workspace";
  title: string;
  due_date: string;
  href: string;
};

export default function WorkPage() {
  const { activeWorkspaceId } = useWorkspace();
  const router = useRouter();
  const [view, setView] = useState<ViewKey>("mine");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());

  const [myTasks, setMyTasks] = useState<QueueTask[]>([]);
  const [teamTasks, setTeamTasks] = useState<QueueTask[]>([]);
  const [workspaces, setWorkspaces] = useState<EngagementWorkspace[]>([]);
  const [recurring, setRecurring] = useState<(Service & { engagement_id: string | null; engagement_status: string | null })[]>([]);
  const [docsForReview, setDocsForReview] = useState<any[]>([]);
  const [organizersForReview, setOrganizersForReview] = useState<any[]>([]);
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [serviceTypeLabels, setServiceTypeLabels] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    supabase
      .from("client_setup_options")
      .select("option_code, option_label")
      .eq("option_group", "client_service_type")
      .then(({ data }) =>
        setServiceTypeLabels(new Map(((data as { option_code: string; option_label: string }[]) ?? []).map((o) => [o.option_code, o.option_label])))
      );
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    supabase
      .from("workspace_members")
      .select("user_id, display_name")
      .eq("workspace_id", activeWorkspaceId)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data ?? []).forEach((m: any) => map.set(m.user_id, m.display_name || "Team member"));
        setMemberNames(map);
      });
  }, [activeWorkspaceId]);

  const clientNameFor = useCallback((row: any) => {
    return (
      row.account_name ||
      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
      "Unnamed client"
    );
  }, []);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      if (view === "mine") {
        if (!userId) return;
        const { data, error } = await supabase
          .from("tasks")
          .select("id, task_title, task_status, priority, due_date, client_id, service_id, assigned_to")
          .eq("workspace_id", activeWorkspaceId)
          .eq("assigned_to", userId)
          .order("due_date", { ascending: true, nullsFirst: false });
        if (error) throw error;
        const rows = ((data as Task[]) ?? []).filter((t) => isOpenTaskStatus(t.task_status));
        const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
        let names = new Map<string, string>();
        if (clientIds.length) {
          const { data: clients } = await supabase
            .from("clients")
            .select("id, account_name, first_name, last_name")
            .in("id", clientIds);
          (clients ?? []).forEach((c: any) => names.set(c.id, clientNameFor(c)));
        }
        setMyTasks(
          rows.map((r) => ({ ...r, client_name: names.get(r.client_id) ?? "—" }) as QueueTask),
        );
      } else if (view === "team") {
        const { data, error } = await supabase.rpc("get_firm_work_queue", {
          p_workspace_id: activeWorkspaceId,
        });
        if (error) throw error;
        setTeamTasks((data?.tasks as QueueTask[]) ?? []);
      } else if (view === "workspaces") {
        const { data, error } = await supabase
          .from("v_engagement_workspace")
          .select("*")
          .eq("workspace_id", activeWorkspaceId)
          .order("due_date", { ascending: true, nullsFirst: false });
        if (error) throw error;
        setWorkspaces((data as EngagementWorkspace[]) ?? []);
      } else if (view === "recurring") {
        const { data: services, error } = await supabase
          .from("services")
          .select("*")
          .eq("workspace_id", activeWorkspaceId)
          .eq("is_recurring", true);
        if (error) throw error;
        const svcList = (services as Service[]) ?? [];
        const serviceIds = svcList.map((s) => s.id);
        let engByService = new Map<string, { id: string; status: string }>();
        if (serviceIds.length) {
          const { data: engs } = await supabase
            .from("engagements")
            .select("id, service_id, status")
            .in("service_id", serviceIds);
          (engs ?? []).forEach((e: any) => engByService.set(e.service_id, { id: e.id, status: e.status }));
        }
        const clientIds = Array.from(new Set(svcList.map((s) => s.client_id)));
        let names = new Map<string, string>();
        if (clientIds.length) {
          const { data: clients } = await supabase
            .from("clients")
            .select("id, account_name, first_name, last_name")
            .in("id", clientIds);
          (clients ?? []).forEach((c: any) => names.set(c.id, clientNameFor(c)));
        }
        setRecurring(
          svcList.map((s) => ({
            ...s,
            engagement_id: engByService.get(s.id)?.id ?? null,
            engagement_status: engByService.get(s.id)?.status ?? null,
            _clientName: names.get(s.client_id) ?? "—",
          }) as any),
        );
      } else if (view === "review") {
        const { data, error } = await supabase.rpc("get_firm_work_queue", {
          p_workspace_id: activeWorkspaceId,
        });
        if (error) throw error;
        setDocsForReview((data?.documents_for_review as any[]) ?? []);
        setOrganizersForReview((data?.organizers_for_review as any[]) ?? []);
      } else if (view === "due") {
        const [tasksRes, deadlinesRes, engagementsRes] = await Promise.all([
          supabase
            .from("tasks")
            .select("id, task_title, task_status, due_date, client_id")
            .eq("workspace_id", activeWorkspaceId)
            .not("due_date", "is", null),
          supabase
            .from("deadlines")
            .select("id, deadline_title, due_date, client_id")
            .eq("workspace_id", activeWorkspaceId)
            .not("due_date", "is", null),
          supabase
            .from("v_engagement_workspace")
            .select("engagement_id, engagement_name, due_date, account_name")
            .eq("workspace_id", activeWorkspaceId)
            .not("due_date", "is", null),
        ]);
        const items: DueItem[] = [
          ...(((tasksRes.data as Task[]) ?? []) as any[])
            .filter((t) => isOpenTaskStatus(t.task_status))
            .map((t) => ({
              id: `task-${t.id}`,
              kind: "Task" as const,
              title: t.task_title,
              due_date: t.due_date,
              href: `/clients/${t.client_id}`,
            })),
          ...(((deadlinesRes.data as Deadline[]) ?? []) as any[]).map((d) => ({
            id: `deadline-${d.id}`,
            kind: "Deadline" as const,
            title: d.deadline_title,
            due_date: d.due_date,
            href: `/clients/${d.client_id}`,
          })),
          ...(((engagementsRes.data as any[]) ?? [])).map((e) => ({
            id: `eng-${e.engagement_id}`,
            kind: "Service Workspace" as const,
            title: `${e.account_name ?? "Client"} — ${e.engagement_name}`,
            due_date: e.due_date,
            href: `/work/${e.engagement_id}`,
          })),
        ].sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
        setDueItems(items);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load work.");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, view, userId, clientNameFor]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberLabel = (id: string | null) => (id ? memberNames.get(id) ?? "Unassigned" : "Unassigned");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Work</h1>
          <p className="mt-1 text-sm text-muted">
            Everything your firm has open, across every Service Workspace.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-paper"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-line">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${
              view === v.key ? "border-[#108A64] text-[#108A64]" : "border-transparent text-muted"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="app-card p-8 text-center text-sm text-muted">Loading…</div>
      ) : (
        <>
          {view === "mine" && (
            <TaskList
              rows={myTasks}
              empty="You have no open tasks. Nice work."
              onOpenClient={(id) => router.push(`/clients/${id}`)}
            />
          )}

          {view === "team" && (
            <TaskList
              rows={teamTasks}
              empty="No open tasks across the team."
              onOpenClient={(id) => router.push(`/clients/${id}`)}
              showAssignee
              memberLabel={memberLabel}
            />
          )}

          {view === "workspaces" && (
            <div className="app-card divide-y divide-line">
              {workspaces.length === 0 && <Empty text="No active Service Workspaces yet. Activate a service from a client's profile." />}
              {workspaces.map((w) => {
                const nextAction = nextEngagementAction(w);
                const atRisk = !w.current_stage_ready || w.missing_documents > 0 || w.unmet_requirements > 0;
                return (
                  <Link
                    key={w.engagement_id}
                    href={`/work/${w.engagement_id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-paper"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-sm">{w.account_name}</span>
                        <span className="text-xs text-muted">— {w.engagement_name}</span>
                        {atRisk && <AlertTriangle size={13} className="text-amber-600" />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                        <StatusPill status={w.status} />
                        <span>{w.stage_name ?? "No stage"}</span>
                        <span>{memberLabel(w.assigned_to)}</span>
                        {nextAction && <span className="font-semibold text-amber-700">{nextAction}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="tabular-nums font-mono">{w.due_date ?? "No due date"}</span>
                      <ChevronRight size={15} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {view === "recurring" && (
            <div className="app-card divide-y divide-line">
              {recurring.length === 0 && <Empty text="No recurring services yet." />}
              {recurring.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="font-semibold text-ink text-sm">{s._clientName}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {humanizeServiceType(s.service_type, serviceTypeLabels)} · {s.billing_frequency || "No billing frequency set"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill status={s.service_status} />
                    {s.engagement_id ? (
                      <Link
                        href={`/work/${s.engagement_id}`}
                        className="text-xs font-semibold text-[#108A64] hover:underline"
                      >
                        Open workspace
                      </Link>
                    ) : (
                      <span className="text-[11px] text-muted">No workspace linked</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "review" && (
            <div className="space-y-4">
              <div className="app-card">
                <div className="border-b border-line px-5 py-3 text-sm font-bold text-ink">
                  Documents awaiting review
                </div>
                <div className="divide-y divide-line">
                  {docsForReview.length === 0 && <Empty text="Nothing waiting on review." />}
                  {docsForReview.map((d) => (
                    <Link
                      key={d.id}
                      href={`/clients/${d.client_id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-paper"
                    >
                      <div>
                        <div className="font-semibold text-ink text-sm">{d.document_name}</div>
                        <div className="text-xs text-muted mt-0.5">{d.client_name}</div>
                      </div>
                      <StatusPill status={d.document_status} />
                    </Link>
                  ))}
                </div>
              </div>
              <div className="app-card">
                <div className="border-b border-line px-5 py-3 text-sm font-bold text-ink">
                  Organizers awaiting review
                </div>
                <div className="divide-y divide-line">
                  {organizersForReview.length === 0 && <Empty text="Nothing waiting on review." />}
                  {organizersForReview.map((o) => (
                    <Link
                      key={o.id}
                      href={`/clients/${o.client_id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-paper"
                    >
                      <div>
                        <div className="font-semibold text-ink text-sm">{o.client_name}</div>
                        <div className="text-xs text-muted mt-0.5">
                          {o.tax_year ? `Tax year ${o.tax_year}` : o.return_type}
                        </div>
                      </div>
                      <StatusPill status={o.assignment_status} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "due" && (
            <div className="app-card divide-y divide-line">
              {dueItems.length === 0 && <Empty text="Nothing on the calendar yet." />}
              {dueItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-paper"
                >
                  <div>
                    <div className="font-semibold text-ink text-sm">{item.title}</div>
                    <div className="text-xs text-muted mt-0.5">{item.kind}</div>
                  </div>
                  <span className="text-xs tabular-nums font-mono text-muted">{item.due_date}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TaskList({
  rows,
  empty,
  onOpenClient,
  showAssignee,
  memberLabel,
}: {
  rows: QueueTask[];
  empty: string;
  onOpenClient: (clientId: string) => void;
  showAssignee?: boolean;
  memberLabel?: (id: string | null) => string;
}) {
  return (
    <div className="app-card divide-y divide-line">
      {rows.length === 0 && <Empty text={empty} />}
      {rows.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpenClient(t.client_id)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-paper"
        >
          <div>
            <div className="font-semibold text-ink text-sm">{t.task_title}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span>{t.client_name}</span>
              {showAssignee && memberLabel && <span>· {memberLabel(t.assigned_to)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={t.task_status} />
            <span className="text-xs tabular-nums font-mono text-muted">{t.due_date ?? "No due date"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted">{text}</div>;
}
