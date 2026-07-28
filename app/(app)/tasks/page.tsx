"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Task, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import NewTaskModal from "@/components/NewTaskModal";
import { friendlyError } from "@/lib/friendlyError";

type TaskWithClient = Task & { clientName: string };

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithClient | null>(null);

  async function load() {
    setLoading(true);
    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true });

    if (taskError) {
      setError(friendlyError(taskError, "We couldn't load your tasks right now. Please try again."));
      setLoading(false);
      return;
    }

    const list = (taskData as Task[]) ?? [];
    const clientIds = Array.from(new Set(list.map((t) => t.client_id)));
    let clientsMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .in("id", clientIds);
      (clientsData as Client[] | null)?.forEach((c) => {
        const name =
          c.client_type === "business" && c.business_name
            ? c.business_name
            : `${c.first_name} ${c.last_name}`.trim();
        clientsMap.set(c.id, name);
      });
    }

    setTasks(list.map((t) => ({ ...t, clientName: clientsMap.get(t.client_id) ?? "—" })));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setShowModal(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function toggleTask(task: TaskWithClient) {
    const nextStatus = task.task_status === "Done" ? "To Do" : "Done";
    const { error } = await supabase
      .from("tasks")
      .update({
        task_status: nextStatus,
        completed_at: nextStatus === "Done" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, task_status: nextStatus } : t))
      );
    }
  }

  const visible = tasks.filter((t) => showDone || t.task_status !== "Done");

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Firm-Wide
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Tasks</h1>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="accent-[#0D1B2A]"
            />
            Show completed
          </label>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
          >
            <Plus size={15} /> New Task
          </button>
        </div>
      </div>

      {showModal && (
        <NewTaskModal onClose={() => setShowModal(false)} onSaved={load} />
      )}
      {editingTask && (
        <NewTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {loading && <div className="px-5 py-6 text-sm text-muted">Loading tasks…</div>}
        {!loading && visible.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted">Nothing here — you&apos;re caught up.</div>
        )}
        {visible.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={t.task_status === "Done"}
                onChange={() => toggleTask(t)}
                className="w-4 h-4 accent-[#0D1B2A]"
              />
              <div>
                <div
                  className="text-sm font-semibold text-ink"
                  style={{
                    textDecoration: t.task_status === "Done" ? "line-through" : "none",
                    opacity: t.task_status === "Done" ? 0.5 : 1,
                  }}
                >
                  {t.task_title}
                </div>
                <div className="text-xs text-muted mt-0.5">{t.clientName}</div>
              </div>
            </label>
            <div className="flex items-center gap-4">
              <span className="text-xs tabular-nums font-mono text-muted">
                {t.due_date ?? "No due date"}
              </span>
              <StatusPill status={t.priority} />
              <button
                onClick={() => setEditingTask(t)}
                className="text-muted hover:text-ink"
                aria-label="Edit task"
              >
                <Pencil size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
