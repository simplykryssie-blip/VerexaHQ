"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import type { TaskRow, StaffOption } from "./EngagementWorkspaceTabs";

export function AddTaskForm({
  workspaceId,
  engagementId,
  tasks,
  staffOptions,
}: {
  workspaceId: string;
  engagementId: string;
  tasks: TaskRow[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const supabase = createClient();

  return (
    <InlineAddForm
      label="Add Task"
      fields={[
        { name: "title", label: "Title", required: true },
        { name: "description", label: "Description", type: "richtext" },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          options: [
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "critical", label: "Critical" },
          ],
        },
        {
          name: "assigned_staff_id",
          label: "Assigned to",
          type: "select",
          options: staffOptions.map((s) => ({ value: s.id, label: s.display_name ?? "Staff" })),
        },
        { name: "due_date", label: "Task due date" },
        {
          name: "visibility",
          label: "Visible to",
          type: "select",
          options: [
            { value: "internal", label: "Staff only" },
            { value: "client", label: "Staff and client (shows in portal)" },
          ],
        },
        ...(tasks.length > 0
          ? [
              {
                name: "depends_on_task_id",
                label: "Depends on",
                type: "select" as const,
                options: tasks.map((t) => ({ value: t.id, label: t.title })),
              },
            ]
          : []),
      ]}
      onSubmit={async (v) => {
        const description = v.description && v.description.replace(/<[^>]+>/g, "").trim() ? v.description : null;
        const { data: task, error } = await supabase
          .from("tasks")
          .insert({
            workspace_id: workspaceId,
            engagement_id: engagementId,
            title: v.title,
            description,
            priority: v.priority || null,
            assigned_staff_id: v.assigned_staff_id || null,
            due_date: v.due_date || null,
            visibility: v.visibility || "internal",
            status: "pending",
          })
          .select("id")
          .single();
        if (error || !task) return error?.message ?? "Could not create task.";

        if (v.depends_on_task_id) {
          const { error: depError } = await supabase.from("task_dependencies").insert({
            workspace_id: workspaceId,
            task_id: task.id,
            depends_on_task_id: v.depends_on_task_id,
          });
          if (depError) return depError.message;
        }

        router.refresh();
      }}
    />
  );
}
