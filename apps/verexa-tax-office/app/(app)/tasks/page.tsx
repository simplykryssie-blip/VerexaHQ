import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getTasks } from "@/features/tasks/queries";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { TaskListView, TaskBoardView, TaskCalendarView } from "@/features/tasks/task-views";
import type { PickerOption } from "@/features/engagements/client-picker";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; scope?: string }> }) {
  const { view = "list", scope = "mine" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const [tasks, { data: staffMembers }] = await Promise.all([
    getTasks(workspaceId, scope === "mine" ? { assignedToUserId: user!.id } : undefined),
    supabase
      .from("workspace_members")
      .select("user_id, profile:user_profiles(display_name, first_name, last_name)")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
  ]);

  const staffOptions: PickerOption[] = (staffMembers ?? []).map((s) => {
    const profile = s.profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
    return { id: s.user_id, label: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Team member" };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">Everything your team needs to follow up on.</p>
        </div>
        <TaskFormDialog workspaceId={workspaceId} staff={staffOptions} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant={scope === "mine" ? "secondary" : "ghost"} size="sm">
            <Link href={`/tasks?scope=mine&view=${view}`}>My tasks</Link>
          </Button>
          <Button asChild variant={scope === "team" ? "secondary" : "ghost"} size="sm">
            <Link href={`/tasks?scope=team&view=${view}`}>Team tasks</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant={view === "list" ? "secondary" : "ghost"} size="sm">
            <Link href={`/tasks?scope=${scope}&view=list`}>List</Link>
          </Button>
          <Button asChild variant={view === "board" ? "secondary" : "ghost"} size="sm">
            <Link href={`/tasks?scope=${scope}&view=board`}>Board</Link>
          </Button>
          <Button asChild variant={view === "calendar" ? "secondary" : "ghost"} size="sm">
            <Link href={`/tasks?scope=${scope}&view=calendar`}>Calendar</Link>
          </Button>
        </div>
      </div>

      {view === "board" ? <TaskBoardView tasks={tasks} /> : view === "calendar" ? <TaskCalendarView tasks={tasks} month={new Date()} /> : <TaskListView tasks={tasks} />}
    </div>
  );
}
