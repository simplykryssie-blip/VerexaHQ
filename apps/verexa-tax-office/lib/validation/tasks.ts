import { z } from "zod";
import type { Enums } from "@/types/database";

type TaskStatus = Enums<"task_status">;
type TaskPriority = Enums<"task_priority">;

// Verbatim from generated database enums — never invent values here.
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting_on_client: "Waiting on client",
  waiting_on_staff: "Waiting on staff",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const TASK_STATUSES = Object.keys(TASK_STATUS_LABELS) as [TaskStatus, ...TaskStatus[]];
export const TASK_PRIORITIES = Object.keys(TASK_PRIORITY_LABELS) as [TaskPriority, ...TaskPriority[]];

export function taskStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (TASK_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function taskPriorityLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (TASK_PRIORITY_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Enter a title."),
  description: z.string().max(2000).optional().nullable(),
  taskType: z.string().max(100).optional().nullable(),
  status: z.enum(TASK_STATUSES).default("not_started"),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  assignedToUserId: z.string().uuid().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  engagementId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskCommentSchema = z.object({
  body: z.string().trim().min(1, "Enter a comment.").max(2000),
  clientVisible: z.boolean().default(false),
});
export type TaskCommentInput = z.infer<typeof taskCommentSchema>;
