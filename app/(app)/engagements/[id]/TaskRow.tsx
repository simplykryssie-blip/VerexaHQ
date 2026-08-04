"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function TaskRow({
  task,
}: {
  task: { id: string; title: string; status: string; due_date: string | null };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, setPending] = useState(false);
  const completed = task.status === "completed";

  async function toggle() {
    setPending(true);
    await supabase
      .from("tasks")
      .update({ status: completed ? "pending" : "completed" })
      .eq("id", task.id);
    setPending(false);
    router.refresh();
  }

  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={completed}
          disabled={pending}
          onChange={toggle}
          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        <span className={completed ? "text-muted line-through" : "text-slate"}>{task.title}</span>
      </label>
      {task.due_date && (
        <span className="text-xs text-muted">{new Date(task.due_date).toLocaleDateString()}</span>
      )}
    </li>
  );
}
