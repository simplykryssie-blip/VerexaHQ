import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { CourseCatalog } from "@/components/learning/CourseCatalog";

export const dynamic = "force-dynamic";

export default async function LearningHubPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: canManage }, { data: courses }, { data: modules }, { data: completions }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "learning_hub.manage" }),
    supabase
      .from("learning_courses")
      .select("id, owner_workspace_id, title, description, status, display_order, workspaces:owner_workspace_id(name)")
      .eq("status", "published")
      .order("display_order"),
    supabase.from("learning_modules").select("id, course_id"),
    supabase.from("learning_module_completions").select("module_id, passed"),
  ]);

  const moduleCountByCourse = new Map<string, number>();
  for (const m of modules ?? []) {
    moduleCountByCourse.set(m.course_id, (moduleCountByCourse.get(m.course_id) ?? 0) + 1);
  }
  const completedModuleIds = new Set((completions ?? []).filter((c) => c.passed).map((c) => c.module_id));
  const moduleToCourse = new Map((modules ?? []).map((m) => [m.id, m.course_id]));
  const completedCountByCourse = new Map<string, number>();
  for (const moduleId of completedModuleIds) {
    const courseId = moduleToCourse.get(moduleId);
    if (!courseId) continue;
    completedCountByCourse.set(courseId, (completedCountByCourse.get(courseId) ?? 0) + 1);
  }

  const courseCards = (courses ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    ownerName: (c.workspaces as unknown as { name: string } | null)?.name ?? null,
    isOwnFirm: c.owner_workspace_id === workspace.id,
    moduleCount: moduleCountByCourse.get(c.id) ?? 0,
    completedCount: completedCountByCourse.get(c.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Learning Hub"
        description="Training courses from your firm and any connected offices."
        actions={
          canManage ? (
            <a
              href="/learning/manage"
              className="inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
            >
              Manage courses
            </a>
          ) : undefined
        }
      />
      <div className="flex-1 px-8 py-6">
        <CourseCatalog courses={courseCards} />
      </div>
    </>
  );
}
