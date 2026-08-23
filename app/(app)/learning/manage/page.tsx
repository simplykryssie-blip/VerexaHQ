import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CourseManageList } from "@/components/learning/CourseManageList";

export const dynamic = "force-dynamic";

export default async function ManageLearningPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: canManage } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "learning_hub.manage",
  });
  if (!canManage) {
    return (
      <>
        <PageHeader backHref="/learning" backLabel="Learning Hub" title="Manage Courses" />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to manage training courses." />
        </div>
      </>
    );
  }

  const { data: courses } = await supabase
    .from("learning_courses")
    .select("id, title, status, display_order")
    .eq("owner_workspace_id", workspace.id)
    .order("display_order");

  return (
    <>
      <PageHeader
        backHref="/learning"
        backLabel="Learning Hub"
        title="Manage Courses"
        description="Courses here are visible to your staff and staff at every office connected to you."
        actions={
          <a href="/learning/manage/progress" className="text-xs font-medium text-accent hover:underline">
            View team progress
          </a>
        }
      />
      <div className="flex-1 px-8 py-6">
        <CourseManageList workspaceId={workspace.id} courses={courses ?? []} />
      </div>
    </>
  );
}
