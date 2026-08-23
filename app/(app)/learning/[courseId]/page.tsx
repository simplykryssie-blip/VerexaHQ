import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { ModuleList } from "@/components/learning/ModuleList";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({ params }: { params: { courseId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: course } = await supabase
    .from("learning_courses")
    .select("id, title, description")
    .eq("id", params.courseId)
    .maybeSingle();
  if (!course) notFound();

  const [{ data: modules }, { data: completions }] = await Promise.all([
    supabase
      .from("learning_modules")
      .select("id, title, module_type, display_order")
      .eq("course_id", params.courseId)
      .order("display_order"),
    supabase.from("learning_module_completions").select("module_id, passed, score_percent"),
  ]);

  const completionByModule = new Map((completions ?? []).map((c) => [c.module_id, c]));

  const moduleRows = (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    moduleType: m.module_type as "lesson" | "quiz",
    passed: completionByModule.get(m.id)?.passed ?? null,
    scorePercent: completionByModule.get(m.id)?.score_percent ?? null,
  }));

  return (
    <>
      <PageHeader backHref="/learning" backLabel="Learning Hub" title={course.title} description={course.description ?? undefined} />
      <div className="flex-1 px-8 py-6">
        <ModuleList courseId={course.id} modules={moduleRows} />
      </div>
    </>
  );
}
