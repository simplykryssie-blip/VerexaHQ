"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  CircleDollarSign,
  FileClock,
  FileText,
  Plus,
  Upload,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";

type DeadlineRow = {
  id: string;
  deadline_title: string;
  due_date: string;
  deadline_status: string;
};

type TaskRow = {
  id: string;
  task_title: string;
  due_date: string | null;
  priority: string | null;
  task_status: string;
};

type ActivityRow = {
  id: string;
  document_name: string;
  document_status: string;
  created_at: string;
};

type DashboardData = {
  clients: number;
  openTasks: number;
  outstanding: number;
  awaitingDocuments: number;
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  documents: ActivityRow[];
};

const INITIAL: DashboardData = {
  clients: 0,
  openTasks: 0,
  outstanding: 0,
  awaitingDocuments: 0,
  deadlines: [],
  tasks: [],
  documents: [],
};

export default function DashboardPage() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const [data, setData] = useState<DashboardData>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);

    const today = new Date().toISOString().slice(0, 10);
    const [clients, tasks, invoices, docs, deadlines, taskList, recentDocs] =
      await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspaceId).is("archived_at", null),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspaceId).neq("task_status", "Done"),
        supabase.from("invoices").select("total_amount,amount_paid").eq("workspace_id", activeWorkspaceId).not("invoice_status", "in", '("Paid","Void","Cancelled")'),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspaceId).in("document_status", ["Requested", "Pending", "Missing"]),
        supabase.from("deadlines").select("id,deadline_title,due_date,deadline_status").eq("workspace_id", activeWorkspaceId).gte("due_date", today).neq("deadline_status", "Completed").order("due_date", { ascending: true }).limit(6),
        supabase.from("tasks").select("id,task_title,due_date,priority,task_status").eq("workspace_id", activeWorkspaceId).neq("task_status", "Done").order("due_date", { ascending: true, nullsFirst: false }).limit(6),
        supabase.from("documents").select("id,document_name,document_status,created_at").eq("workspace_id", activeWorkspaceId).order("created_at", { ascending: false }).limit(5),
      ]);

    const firstError = [clients, tasks, invoices, docs, deadlines, taskList, recentDocs].find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const outstanding = (invoices.data ?? []).reduce(
      (sum, invoice: any) => sum + Math.max(Number(invoice.total_amount ?? 0) - Number(invoice.amount_paid ?? 0), 0),
      0,
    );

    setData({
      clients: clients.count ?? 0,
      openTasks: tasks.count ?? 0,
      outstanding,
      awaitingDocuments: docs.count ?? 0,
      deadlines: (deadlines.data ?? []) as DeadlineRow[],
      tasks: (taskList.data ?? []) as TaskRow[],
      documents: (recentDocs.data ?? []) as ActivityRow[],
    });
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }, []);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-line bg-[#132922] p-6 text-white shadow-sm md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-white/50">Workspace command center</p>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl">{greeting}. Here’s what needs attention.</h1>
            <p className="mt-2 text-sm text-white/65">{activeWorkspace?.name ?? "Your firm"} · Keep client work, deadlines, and cash flow moving.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickLink href="/clients" icon={Plus} label="Add client" />
            <QuickLink href="/documents" icon={Upload} label="Request documents" />
            <QuickLink href="/billing" icon={CircleDollarSign} label="Create invoice" />
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Active clients" value={loading ? "—" : data.clients.toLocaleString()} helper="Across this workspace" />
        <Metric icon={CheckSquare} label="Open tasks" value={loading ? "—" : data.openTasks.toLocaleString()} helper="Work still in motion" />
        <Metric icon={FileClock} label="Documents needed" value={loading ? "—" : data.awaitingDocuments.toLocaleString()} helper="Requested or missing" />
        <Metric icon={CircleDollarSign} label="Outstanding" value={loading ? "—" : money(data.outstanding)} helper="Unpaid invoice balance" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <div className="app-card p-5">
          <SectionHeader title="Today’s work" href="/tasks" />
          <div className="mt-4 divide-y divide-line">
            {!loading && data.tasks.length === 0 && <Empty text="No open tasks. Your queue is clear." />}
            {data.tasks.map((task) => (
              <Link key={task.id} href="/tasks" className="flex items-center justify-between gap-4 py-3.5 transition hover:bg-paper">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{task.task_title}</div>
                  <div className="mt-1 text-xs text-muted">{task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${priorityClass(task.priority)}`}>{task.priority || "Normal"}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="app-card p-5">
          <SectionHeader title="Upcoming deadlines" href="/deadlines" />
          <div className="mt-4 space-y-3">
            {!loading && data.deadlines.length === 0 && <Empty text="No upcoming deadlines found." />}
            {data.deadlines.map((deadline) => (
              <Link key={deadline.id} href="/deadlines" className="flex items-start gap-3 rounded-xl border border-line p-3.5 hover:border-[#108A64]/40 hover:bg-emerald-50/40">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#108A64]"><CalendarClock size={18} /></div>
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-ink">{deadline.deadline_title}</div><div className="mt-1 text-xs text-muted">{formatDate(deadline.due_date)} · {deadline.deadline_status}</div></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="app-card p-5">
        <SectionHeader title="Recent client activity" href="/documents" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {!loading && data.documents.length === 0 && <Empty text="Recent uploads and document requests will appear here." />}
          {data.documents.map((doc) => (
            <Link key={doc.id} href="/documents" className="flex items-center gap-3 rounded-xl border border-line p-4 hover:border-[#108A64]/35 hover:shadow-sm">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><FileText size={18} /></div>
              <div className="min-w-0"><div className="truncate text-sm font-semibold text-ink">{doc.document_name}</div><div className="mt-1 text-xs text-muted">{doc.document_status} · {formatDate(doc.created_at)}</div></div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, helper }: { icon: any; label: string; value: string; helper: string }) {
  return <div className="app-card p-5"><div className="flex items-center justify-between"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-[#108A64]"><Icon size={19} /></div></div><div className="mt-5 text-3xl font-bold tabular-nums text-ink">{value}</div><div className="mt-1 text-sm font-semibold text-ink">{label}</div><div className="mt-1 text-xs text-muted">{helper}</div></div>;
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return <Link href={href} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-white/15"><Icon size={16} />{label}</Link>;
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return <div className="flex items-center justify-between"><h2 className="font-bold text-ink">{title}</h2><Link href={href} className="flex items-center gap-1 text-xs font-semibold text-[#108A64]">View all <ArrowRight size={14} /></Link></div>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">{text}</div>; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function formatDate(value: string) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function priorityClass(priority: string | null) { const p = (priority ?? "").toLowerCase(); if (p.includes("high") || p.includes("urgent")) return "bg-red-50 text-red-700"; if (p.includes("low")) return "bg-slate-100 text-slate-600"; return "bg-amber-50 text-amber-700"; }
