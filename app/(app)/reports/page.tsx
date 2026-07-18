"use client";
import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Clock, FileText, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
export default function ReportsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [data, setData] = useState({
    clients: 0,
    openTasks: 0,
    deadlines: 0,
    outstanding: 0,
    paid: 0,
    documents: 0,
  });
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [c, t, d, i, p, docs] = await Promise.all([
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", activeWorkspaceId)
        .eq("status", "active"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", activeWorkspaceId)
        .neq("task_status", "Completed"),
      supabase
        .from("deadlines")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", activeWorkspaceId)
        .lt("due_date", now.toISOString().slice(0, 10))
        .neq("deadline_status", "Completed"),
      supabase
        .from("invoices")
        .select("balance_due")
        .eq("workspace_id", activeWorkspaceId),
      supabase
        .from("invoice_payments")
        .select("payment_amount")
        .eq("workspace_id", activeWorkspaceId)
        .gte("paid_at", month),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", activeWorkspaceId)
        .eq("is_archived", false),
    ]);
    setData({
      clients: c.count ?? 0,
      openTasks: t.count ?? 0,
      deadlines: d.count ?? 0,
      outstanding: (i.data ?? []).reduce(
        (s: any, r: any) => s + Number(r.balance_due ?? 0),
        0,
      ),
      paid: (p.data ?? []).reduce(
        (s: any, r: any) => s + Number(r.payment_amount ?? 0),
        0,
      ),
      documents: docs.count ?? 0,
    });
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);
  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Reports</h1>
      <p className="mt-1 text-sm text-muted">
        Live operational and financial snapshots from your workspace.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          icon={Users}
          label="Active clients"
          value={String(data.clients)}
        />
        <Card icon={Clock} label="Open tasks" value={String(data.openTasks)} />
        <Card
          icon={Clock}
          label="Past-due deadlines"
          value={String(data.deadlines)}
        />
        <Card
          icon={CircleDollarSign}
          label="Outstanding invoices"
          value={money(data.outstanding)}
        />
        <Card
          icon={CircleDollarSign}
          label="Paid this month"
          value={money(data.paid)}
        />
        <Card
          icon={FileText}
          label="Stored documents"
          value={String(data.documents)}
        />
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">About these reports</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Figures are calculated from live workspace records and respect
          Supabase access policies. Export-ready financial statements remain
          attached through Bookkeeping report delivery.
        </p>
      </div>
    </div>
  );
}
function Card({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-[#108A64]">
        <Icon size={19} />
      </div>
      <div className="mt-4 text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}
