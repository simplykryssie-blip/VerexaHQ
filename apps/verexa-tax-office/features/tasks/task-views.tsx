"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { taskStatusLabel, taskPriorityLabel, TASK_STATUS_LABELS } from "@/lib/validation/tasks";
import { formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type TaskRow = Tables<"tasks"> & {
  client?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  engagement?: { engagement_number?: string | null; title?: string | null } | null;
  lead?: { first_name?: string | null; last_name?: string | null } | null;
};

function taskSubject(task: TaskRow): string {
  if (task.client) return task.client.company || `${task.client.first_name ?? ""} ${task.client.last_name ?? ""}`.trim();
  if (task.engagement) return task.engagement.engagement_number ?? task.engagement.title ?? "";
  if (task.lead) return `${task.lead.first_name ?? ""} ${task.lead.last_name ?? ""}`.trim();
  return "";
}

function StatusSelect({ task }: { task: TaskRow }) {
  const router = useRouter();
  const supabase = createClient();
  async function update(status: string) {
    const patch: Record<string, unknown> = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    if (status === "in_progress" && !task.started_at) patch.started_at = new Date().toISOString();
    const { error } = await supabase.from("tasks").update(patch as never).eq("id", task.id);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    router.refresh();
  }
  return (
    <Select value={task.status} onValueChange={update}>
      <SelectTrigger className="w-40 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(TASK_STATUS_LABELS).map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskListView({ tasks }: { tasks: TaskRow[] }) {
  const now = new Date();
  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {tasks.map((task) => {
        const overdue = task.due_at && new Date(task.due_at) < now && task.status !== "completed" && task.status !== "cancelled";
        return (
          <div key={task.id} className="flex items-center justify-between gap-3 p-3 flex-wrap">
            <div className="min-w-0">
              <Link href={`/tasks/${task.id}`} className="text-sm font-medium hover:underline">
                {task.title}
              </Link>
              <div className="text-xs text-muted-foreground truncate">{taskSubject(task) || "No linked record"}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={task.priority === "urgent" || task.priority === "high" ? "destructive" : "outline"}>{taskPriorityLabel(task.priority)}</Badge>
              {task.due_at && (
                <span className={cn("text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>{formatDate(task.due_at)}</span>
              )}
              <StatusSelect task={task} />
            </div>
          </div>
        );
      })}
      {tasks.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">No tasks match this view.</p>}
    </div>
  );
}

export function TaskBoardView({ tasks }: { tasks: TaskRow[] }) {
  const columns: (keyof typeof TASK_STATUS_LABELS)[] = ["not_started", "in_progress", "waiting_on_client", "waiting_on_staff", "completed"];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 overflow-x-auto">
      {columns.map((col) => {
        const items = tasks.filter((t) => t.status === col);
        return (
          <div key={col} className="min-w-[220px]">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center justify-between">
              {taskStatusLabel(col)}
              <span className="text-muted-foreground/70">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block rounded-lg border border-border bg-card p-3 hover:shadow-sm transition-shadow">
                  <div className="text-sm font-medium">{task.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{taskSubject(task) || "No linked record"}</div>
                  <Badge variant={task.priority === "urgent" || task.priority === "high" ? "destructive" : "outline"} className="mt-1.5">
                    {taskPriorityLabel(task.priority)}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TaskCalendarView({ tasks, month }: { tasks: TaskRow[]; month: Date }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (!t.due_at) continue;
      const key = format(new Date(t.due_at), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tasks]);

  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} className="text-center font-medium text-muted-foreground py-1">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const dayTasks = tasksByDay.get(key) ?? [];
        return (
          <div
            key={key}
            className={cn(
              "min-h-24 rounded-md border border-border p-1 space-y-1 overflow-hidden",
              !isSameMonth(day, month) && "opacity-40",
              isSameDay(day, new Date()) && "border-brand",
            )}
          >
            <div className="text-[10px] text-muted-foreground">{format(day, "d")}</div>
            {dayTasks.slice(0, 3).map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} className="block truncate rounded bg-secondary px-1 py-0.5 text-[10px] hover:underline">
                {t.title}
              </Link>
            ))}
            {dayTasks.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayTasks.length - 3} more</div>}
          </div>
        );
      })}
    </div>
  );
}
