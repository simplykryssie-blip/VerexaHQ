import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { CalendarView, type CalendarItem } from "./CalendarView";

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: engagements }, { data: tasks }] = await Promise.all([
    supabase
      .from("engagements")
      .select("id, engagement_number, due_date")
      .eq("workspace_id", workspace.id)
      .not("due_date", "is", null),
    supabase
      .from("tasks")
      .select("id, title, due_date")
      .eq("workspace_id", workspace.id)
      .not("due_date", "is", null)
      .neq("status", "completed"),
  ]);

  const items: CalendarItem[] = [
    ...(engagements ?? []).map((e) => ({
      id: e.id,
      date: e.due_date as string,
      label: e.engagement_number ?? "Engagement",
      href: `/engagements/${e.id}`,
      kind: "engagement" as const,
    })),
    ...(tasks ?? []).map((t) => ({
      id: t.id,
      date: t.due_date as string,
      label: t.title,
      href: undefined,
      kind: "task" as const,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Engagement and task due dates across your workspace."
      />
      <div className="flex-1 px-8 py-6">
        <CalendarView items={items} />
      </div>
    </>
  );
}
