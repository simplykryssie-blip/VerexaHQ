"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Deadline } from "@/lib/types";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-sm p-5 flex-1 min-w-[180px]">
      <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-2">
        {label}
      </div>
      <div className="text-3xl font-bold tabular-nums font-mono text-ink">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [pastDue, setPastDue] = useState<number | null>(null);
  const [upcoming, setUpcoming] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [clientsRes, tasksRes, deadlinesRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .neq("task_status", "Done"),
        supabase
          .from("deadlines")
          .select("*")
          .order("due_date", { ascending: true })
          .limit(8),
      ]);

      if (clientsRes.error || tasksRes.error || deadlinesRes.error) {
        setError(
          clientsRes.error?.message ||
            tasksRes.error?.message ||
            deadlinesRes.error?.message ||
            "Failed to load dashboard data"
        );
        setLoading(false);
        return;
      }

      setClientCount(clientsRes.count ?? 0);
      setOpenTasks(tasksRes.count ?? 0);
      const deadlines = (deadlinesRes.data as Deadline[]) ?? [];
      setUpcoming(deadlines);
      setPastDue(deadlines.filter((d) => d.deadline_status === "Past Due").length);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
          Overview
        </div>
        <h1 className="font-slab text-2xl font-bold text-ink">Dashboard</h1>
      </div>

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <StatCard label="Clients" value={loading ? "…" : clientCount ?? 0} />
        <StatCard label="Open Tasks" value={loading ? "…" : openTasks ?? 0} />
        <StatCard
          label="Past-Due Deadlines"
          value={loading ? "…" : pastDue ?? 0}
        />
      </div>

      <div>
        <div className="border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-xl font-bold text-ink">
            Upcoming Deadlines
          </h2>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {!loading && upcoming.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted">
              No deadlines yet. Add one from a client&apos;s detail page.
            </div>
          )}
          {upcoming.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-ink text-sm">
                  {d.deadline_title}
                </div>
                <div className="text-xs text-muted mt-0.5">{d.deadline_type}</div>
              </div>
              <span className="text-sm tabular-nums font-mono text-ink">
                {d.due_date}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
