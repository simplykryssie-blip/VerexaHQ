"use client";

import { useEffect, useState } from "react";
import { supabasePortal } from "@/lib/supabasePortal";
import { usePortal } from "@/components/portal/PortalContext";
import type { ClientPortalTodo } from "@/lib/types";

export default function PortalTodosPage() {
  const { access } = usePortal();
  const [todos, setTodos] = useState<ClientPortalTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  async function load() {
    if (!access) return;
    setLoading(true);
    const { data } = await supabasePortal
      .from("client_portal_todos")
      .select("*")
      .eq("client_id", access.client_id)
      .eq("client_visible", true)
      .order("due_date", { ascending: true });
    setTodos((data as ClientPortalTodo[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  async function markDone(todo: ClientPortalTodo) {
    if (!access) return;
    const nextStatus = todo.todo_status === "completed" ? "open" : "completed";
    const { error } = await supabasePortal.rpc("mark_portal_todo_status", {
      p_workspace_id: access.workspace_id,
      p_todo_id: todo.id,
      p_todo_status: nextStatus,
    });
    if (!error) {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, todo_status: nextStatus } : t))
      );
    }
  }

  const visible = todos.filter((t) => showCompleted || t.todo_status !== "completed");

  if (!access) return null;

  return (
    <div>
      <div className="flex items-end justify-between mb-4 border-b border-line pb-3">
        <h1 className="font-slab text-2xl font-bold text-ink">To-Dos</h1>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="accent-[#0D1B2A]"
          />
          Show completed
        </label>
      </div>

      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {loading && <div className="px-5 py-6 text-sm text-muted">Loading…</div>}
        {!loading && visible.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted">Nothing here — you&apos;re all set.</div>
        )}
        {visible.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={t.todo_status === "completed"}
                onChange={() => markDone(t)}
                className="w-4 h-4 accent-[#0D1B2A]"
              />
              <div>
                <div
                  className="text-sm font-semibold text-ink"
                  style={{
                    textDecoration: t.todo_status === "completed" ? "line-through" : "none",
                    opacity: t.todo_status === "completed" ? 0.5 : 1,
                  }}
                >
                  {t.title}
                </div>
                {t.description && <div className="text-xs text-muted mt-0.5">{t.description}</div>}
              </div>
            </label>
            {t.due_date && (
              <span className="text-xs tabular-nums font-mono text-muted">Due {t.due_date}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
