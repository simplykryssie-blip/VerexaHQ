"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function PortalTaskItem({
  task,
}: {
  task: { id: string; title: string; description: string | null; due_date: string | null; status: string };
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const completed = task.status === "completed";

  async function toggle() {
    setPending(true);
    const { error } = await supabase.rpc("set_client_task_completed", { p_task_id: task.id, p_completed: !completed });
    setPending(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <input
        type="checkbox"
        checked={completed}
        disabled={pending}
        onChange={toggle}
        className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
      />
      <div className="min-w-0 flex-1">
        <p className={completed ? "text-sm text-muted line-through" : "text-sm font-medium text-ink"}>{task.title}</p>
        {task.description && <p className="mt-0.5 text-xs text-muted">{task.description}</p>}
        {task.due_date && <p className="mt-1 text-xs text-muted">Due {new Date(task.due_date).toLocaleDateString()}</p>}
      </div>
    </li>
  );
}
