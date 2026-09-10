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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: course } = await supabase
    .from("learning_courses")
    .select("id, title, description, created_at")
    .eq("id", params.courseId)
    .maybeSingle();
  if (!course) notFound();

  const [{ data: modules }, { data: completions }, { data: assignment }] = await Promise.all([
    supabase
      .from("learning_modules")
      .select("id, title, module_type, display_order, release_date, release_offset_days")
      .eq("course_id", params.courseId)
      .order("display_order"),
    supabase.from("learning_module_completions").select("module_id, passed, score_percent"),
    user
      ? supabase.from("learning_course_assignments").select("created_at").eq("course_id", params.courseId).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const completionByModule = new Map((completions ?? []).map((c) => [c.module_id, c]));

  const liveSessionModuleIds = (modules ?? []).filter((m) => m.module_type === "live_session").map((m) => m.id);
  const { data: liveSessionRows } =
    liveSessionModuleIds.length > 0
      ? await supabase.from("learning_live_sessions").select("module_id, scheduled_start").in("module_id", liveSessionModuleIds)
      : { data: [] };
  const liveSessionStartByModule = new Map((liveSessionRows ?? []).map((r) => [r.module_id, r.scheduled_start]));

  const moduleRows = (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    moduleType: m.module_type as "lesson" | "quiz" | "live_session",
    passed: completionByModule.get(m.id)?.passed ?? null,
    scorePercent: completionByModule.get(m.id)?.score_percent ?? null,
    releaseDate: m.release_date,
    releaseOffsetDays: m.release_offset_days,
    liveSessionStart: liveSessionStartByModule.get(m.id) ?? null,
  }));

  return (
    <>
      <PageHeader backHref="/learning" backLabel="Learning Hub" title={course.title} description={course.description ?? undefined} />
      <div className="flex-1 px-8 py-6">
        <ModuleList
          courseId={course.id}
          modules={moduleRows}
          scheduleAnchor={{ assignedAt: assignment?.created_at ?? null, courseCreatedAt: course.created_at }}
        />
      </div>
    </>
  );
}
