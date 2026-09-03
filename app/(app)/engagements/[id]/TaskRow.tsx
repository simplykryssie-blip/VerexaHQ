"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { TaskRow as TaskRowType } from "./EngagementWorkspaceTabs";

export function TaskRow({ task }: { task: TaskRowType }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const completed = task.status === "completed";
  const blockedBy = task.dependencies.filter((d) => d.depends_on_title);

  async function toggle() {
    setPending(true);
    const { error } = await supabase
      .from("tasks")
      .update({ status: completed ? "pending" : "completed", completed_at: completed ? null : new Date().toISOString() })
      .eq("id", task.id);
    setPending(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(completed ? "Task reopened" : "Task completed", "success");
    router.refresh();
  }

  return (
    <li className="py-2 text-sm">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={completed}
            disabled={pending}
            onChange={toggle}
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          <span className={completed ? "text-muted line-through" : "text-slate"}>{task.title}</span>
          {task.priority && <span className="text-xs capitalize text-muted">({task.priority})</span>}
          {task.visibility === "client" && (
            <span className="rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              Client visible
            </span>
          )}
        </label>
        {task.due_date && <span className="text-xs text-muted">{new Date(task.due_date).toLocaleDateString()}</span>}
      </div>
      {(task.assigned_staff || blockedBy.length > 0 || task.description) && (
        <div className="mt-1 pl-6 text-xs text-muted">
          {task.assigned_staff && <span>Assigned to {task.assigned_staff.display_name ?? "staff"}</span>}
          {blockedBy.length > 0 && (
            <span className="ml-2">
              Depends on: {blockedBy.map((d) => d.depends_on_title).join(", ")}
            </span>
          )}
          {task.description && (
            <div className="prose prose-sm mt-0.5 max-w-none text-xs text-muted" dangerouslySetInnerHTML={{ __html: task.description }} />
          )}
        </div>
      )}
    </li>
  );
}
