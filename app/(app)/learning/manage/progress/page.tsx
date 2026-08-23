import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function LearningProgressPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: rows, error } = await supabase.rpc("get_learning_completion_rollup", { p_owner_workspace_id: workspace.id });

  return (
    <>
      <PageHeader backHref="/learning/manage" backLabel="Manage Courses" title="Team Progress" description="Completions across your firm and every connected office." />
      <div className="flex-1 px-8 py-6">
        {error ? (
          <EmptyState message={error.message} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState message="No completions recorded yet." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Office</th>
                  <th className="px-4 py-2">Staff</th>
                  <th className="px-4 py-2">Course</th>
                  <th className="px-4 py-2">Module</th>
                  <th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-ink">{r.source_workspace_name}</td>
                    <td className="px-4 py-2 text-ink">{r.user_email}</td>
                    <td className="px-4 py-2 text-slate">{r.course_title}</td>
                    <td className="px-4 py-2 text-slate">{r.module_title}</td>
                    <td className="px-4 py-2">
                      {r.module_type === "quiz" ? (
                        <Badge tone={r.passed ? "success" : "danger"}>{r.passed ? `Passed (${r.score_percent}%)` : `Failed (${r.score_percent}%)`}</Badge>
                      ) : (
                        <Badge tone="success">Completed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
