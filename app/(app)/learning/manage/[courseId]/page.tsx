import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { CourseEditor } from "@/components/learning/CourseEditor";

export const dynamic = "force-dynamic";

export default async function ManageCoursePage({ params }: { params: { courseId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: course } = await supabase
    .from("learning_courses")
    .select("id, title, description, status")
    .eq("id", params.courseId)
    .maybeSingle();
  if (!course) notFound();

  const { data: modules } = await supabase
    .from("learning_modules")
    .select("id, title, module_type, display_order")
    .eq("course_id", params.courseId)
    .order("display_order");

  return (
    <>
      <PageHeader backHref="/learning/manage" backLabel="Manage Courses" title={course.title} />
      <div className="flex-1 px-8 py-6">
        <CourseEditor course={course} modules={modules ?? []} />
      </div>
    </>
  );
}
