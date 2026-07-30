import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatters";

type ActivityItem = { id: string; label: string; detail?: string; at: string };

export async function ClientActivityTab({ clientId }: { clientId: string }) {
  const supabase = await createClient();

  const [{ data: intakeSubs }, { data: tasks }] = await Promise.all([
    supabase.from("intake_submissions").select("id, status, submitted_at, approved_at, reviewed_at, created_at, template:templates(name)").eq("client_id", clientId),
    supabase.from("tasks").select("id, title, status, created_at, completed_at").eq("client_id", clientId),
  ]);

  const submissionIds = (intakeSubs ?? []).map((s) => s.id);
  const { data: revisions } =
    submissionIds.length > 0
      ? await supabase.from("intake_submission_revisions").select("id, reason, created_at, submission_id").in("submission_id", submissionIds)
      : { data: [] };

  const items: ActivityItem[] = [];

  for (const s of intakeSubs ?? []) {
    const template = s.template as { name?: string } | null;
    items.push({ id: `intake-created-${s.id}`, label: `Intake organizer assigned`, detail: template?.name, at: s.created_at });
    if (s.submitted_at) items.push({ id: `intake-submitted-${s.id}`, label: "Intake submitted", detail: template?.name, at: s.submitted_at });
    if (s.approved_at) items.push({ id: `intake-approved-${s.id}`, label: "Intake approved", detail: template?.name, at: s.approved_at });
  }
  for (const r of revisions ?? []) {
    items.push({ id: `revision-${r.id}`, label: `Intake revision (${r.reason.replace(/_/g, " ")})`, at: r.created_at });
  }
  for (const t of tasks ?? []) {
    items.push({ id: `task-created-${t.id}`, label: `Task created: ${t.title}`, at: t.created_at });
    if (t.completed_at) items.push({ id: `task-completed-${t.id}`, label: `Task completed: ${t.title}`, at: t.completed_at });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No activity recorded for this client yet.</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.slice(0, 50).map((item) => (
        <li key={item.id} className="p-3 text-sm flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">{item.label}</div>
            {item.detail && <div className="text-xs text-muted-foreground">{item.detail}</div>}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(item.at)}</span>
        </li>
      ))}
    </ul>
  );
}
