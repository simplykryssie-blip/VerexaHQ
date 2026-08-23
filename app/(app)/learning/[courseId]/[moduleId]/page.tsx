import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { LessonViewer } from "@/components/learning/LessonViewer";
import { QuizPlayer } from "@/components/learning/QuizPlayer";

export const dynamic = "force-dynamic";

export default async function ModuleViewerPage({ params }: { params: { courseId: string; moduleId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: course }, { data: module_ }, { data: completion }] = await Promise.all([
    supabase.from("learning_courses").select("id, title").eq("id", params.courseId).maybeSingle(),
    supabase
      .from("learning_modules")
      .select("id, title, module_type, body, video_url, video_storage_path")
      .eq("id", params.moduleId)
      .maybeSingle(),
    supabase
      .from("learning_module_completions")
      .select("passed, score_percent")
      .eq("module_id", params.moduleId)
      .maybeSingle(),
  ]);

  if (!course || !module_) notFound();

  return (
    <>
      <PageHeader backHref={`/learning/${course.id}`} backLabel={course.title} title={module_.title} />
      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-[720px]">
          {module_.module_type === "lesson" ? (
            <LessonViewer
              moduleId={module_.id}
              body={module_.body}
              videoUrl={module_.video_url}
              videoStoragePath={module_.video_storage_path}
              alreadyComplete={Boolean(completion?.passed)}
            />
          ) : (
            <QuizPlayer moduleId={module_.id} previousScore={completion?.score_percent ?? null} previouslyPassed={completion?.passed ?? null} />
          )}
        </div>
      </div>
    </>
  );
}
