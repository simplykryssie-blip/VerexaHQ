import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { LessonEditor } from "@/components/learning/LessonEditor";
import { QuizEditor } from "@/components/learning/QuizEditor";

export const dynamic = "force-dynamic";

export default async function ManageModulePage({ params }: { params: { courseId: string; moduleId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: module_ } = await supabase
    .from("learning_modules")
    .select("id, course_id, title, module_type, body, video_url, video_storage_path, passing_score_percent, learning_courses(owner_workspace_id)")
    .eq("id", params.moduleId)
    .maybeSingle();
  if (!module_) notFound();

  const ownerWorkspaceId = (module_.learning_courses as unknown as { owner_workspace_id: string } | null)?.owner_workspace_id ?? workspace.id;

  let questions: { id: string; question_text: string; display_order: number; options: { id: string; option_text: string; is_correct: boolean; display_order: number }[] }[] = [];
  if (module_.module_type === "quiz") {
    const { data: q } = await supabase
      .from("learning_quiz_questions")
      .select("id, question_text, display_order, learning_quiz_options(id, option_text, is_correct, display_order)")
      .eq("module_id", module_.id)
      .order("display_order");
    questions = (q ?? []).map((row) => ({
      id: row.id,
      question_text: row.question_text,
      display_order: row.display_order,
      options: ((row.learning_quiz_options as unknown as { id: string; option_text: string; is_correct: boolean; display_order: number }[]) ?? [])
        .slice()
        .sort((a, b) => a.display_order - b.display_order),
    }));
  }

  return (
    <>
      <PageHeader backHref={`/learning/manage/${params.courseId}`} backLabel="Back to course" title={module_.title} />
      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-[720px]">
          {module_.module_type === "lesson" ? (
            <LessonEditor
              ownerWorkspaceId={ownerWorkspaceId}
              moduleId={module_.id}
              title={module_.title}
              body={module_.body}
              videoUrl={module_.video_url}
              videoStoragePath={module_.video_storage_path}
            />
          ) : (
            <QuizEditor moduleId={module_.id} title={module_.title} passingScorePercent={module_.passing_score_percent} questions={questions} />
          )}
        </div>
      </div>
    </>
  );
}
