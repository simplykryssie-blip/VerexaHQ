import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { PageHeader } from "@/components/PageHeader";
import { CourseEditor } from "@/components/learning/CourseEditor";
import { CourseAssignmentManager } from "@/components/learning/CourseAssignmentManager";

export const dynamic = "force-dynamic";

export default async function ManageCoursePage({ params }: { params: { courseId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: course } = await supabase
    .from("learning_courses")
    .select("id, title, description, category, status")
    .eq("id", params.courseId)
    .maybeSingle();
  if (!course) notFound();

  const [{ data: modules }, staffMembers, { data: assignmentRows }] = await Promise.all([
    supabase.from("learning_modules").select("id, title, module_type, display_order").eq("course_id", params.courseId).order("display_order"),
    getWorkspaceStaff(supabase, workspace.id),
    supabase.from("learning_course_assignments").select("user_id, due_date").eq("course_id", params.courseId),
  ]);

  const staffOptions = staffMembers.map((s) => ({ id: s.user_id, displayName: s.display_name ?? "Staff member" }));
  const assignments = (assignmentRows ?? []).map((a) => ({ userId: a.user_id, dueDate: a.due_date }));

  return (
    <>
      <PageHeader backHref="/learning/manage" backLabel="Manage Courses" title={course.title} />
      <div className="flex-1 space-y-6 px-8 py-6">
        <CourseEditor course={course} modules={modules ?? []} />
        <CourseAssignmentManager courseId={course.id} staffOptions={staffOptions} initialAssignments={assignments} />
      </div>
    </>
  );
}
