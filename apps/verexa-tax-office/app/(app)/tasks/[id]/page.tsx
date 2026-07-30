import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTaskDetail } from "@/features/tasks/queries";
import { TaskComments } from "@/features/tasks/task-comments";
import { taskStatusLabel, taskPriorityLabel } from "@/lib/validation/tasks";
import { formatDateTime } from "@/lib/formatters";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { task, comments } = await getTaskDetail(id);
  if (!task) notFound();

  const client = task.client as { first_name?: string; last_name?: string; company?: string } | null;
  const engagement = task.engagement as { engagement_number?: string; title?: string } | null;
  const lead = task.lead as { first_name?: string; last_name?: string } | null;

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to tasks
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{taskStatusLabel(task.status)}</Badge>
          <Badge variant={task.priority === "urgent" || task.priority === "high" ? "destructive" : "outline"}>{taskPriorityLabel(task.priority)}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {task.description && <p>{task.description}</p>}
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>Due: {formatDateTime(task.due_at)}</div>
            <div>Created: {formatDateTime(task.created_at)}</div>
            {client && (
              <div>
                Client:{" "}
                <Link href={`/clients/${client && task.client_id}`} className="hover:underline">
                  {client.company || `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim()}
                </Link>
              </div>
            )}
            {engagement && (
              <div>
                Engagement:{" "}
                <Link href={`/engagements/${task.engagement_id}`} className="hover:underline">
                  {engagement.engagement_number ?? engagement.title}
                </Link>
              </div>
            )}
            {lead && <div>Lead: {`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskComments taskId={task.id} workspaceId={task.workspace_id} comments={comments} />
        </CardContent>
      </Card>
    </div>
  );
}
