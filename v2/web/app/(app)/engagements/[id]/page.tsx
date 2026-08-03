import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusSelect } from "./StatusSelect";
import { TaskRow } from "./TaskRow";
import { AddEngagementNoteForm } from "./AddEngagementNoteForm";

const STATUS_OPTIONS = [
  "New",
  "Waiting On Client",
  "Waiting On Staff",
  "In Progress",
  "Waiting On Review",
  "Corrections Requested",
  "Approved",
  "Waiting On Signature",
  "Waiting On Payment",
  "Ready To Release",
  "Completed",
  "Archived",
];

function clientLabel(c: {
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
} | null) {
  if (!c) return "--";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function EngagementDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select(
      "id, engagement_number, status, priority, review_status, due_date, open_date, completed_date, client_id, clients(id, first_name, last_name, business_name, client_type), assigned_staff:user_profiles!engagements_assigned_staff_id_fkey(display_name)"
    )
    .eq("id", params.id)
    .single();

  if (!engagement) notFound();

  const [{ data: workflowRuns }, { data: activity }, { data: notes }, { data: documents }] =
    await Promise.all([
      supabase.from("workflow_runs").select("id").eq("engagement_id", engagement.id),
      supabase
        .from("activity_log")
        .select("id, description, created_at")
        .eq("entity_type", "engagement")
        .eq("entity_id", engagement.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("notes")
        .select("id, body, created_at")
        .eq("entity_type", "engagement")
        .eq("entity_id", engagement.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("attachments")
        .select("id, file_name, created_at")
        .eq("entity_type", "engagement")
        .eq("entity_id", engagement.id)
        .order("created_at", { ascending: false }),
    ]);

  const workflowRunIds = (workflowRuns ?? []).map((r) => r.id);
  let tasks: { id: string; title: string; status: string; due_date: string | null }[] = [];
  if (workflowRunIds.length > 0) {
    const { data: stageRows } = await supabase
      .from("workflow_stages")
      .select("id")
      .in("workflow_run_id", workflowRunIds);
    const stageIds = (stageRows ?? []).map((s) => s.id);
    if (stageIds.length > 0) {
      const { data: taskRows } = await supabase
        .from("tasks")
        .select("id, title, status, due_date")
        .in("workflow_stage_id", stageIds)
        .order("created_at");
      tasks = taskRows ?? [];
    }
  }

  const client = engagement.clients as unknown as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    client_type: string;
  } | null;
  const assignedStaff = engagement.assigned_staff as unknown as { display_name: string | null } | null;

  return (
    <>
      <PageHeader
        title={engagement.engagement_number ?? "Engagement"}
        description={
          client ? (
            <span>
              Client:{" "}
              <Link href={`/clients/${client.id}`} className="text-accent hover:underline">
                {clientLabel(client)}
              </Link>
            </span>
          ) : undefined
        }
      />

      <div className="flex-1 space-y-6 px-8 py-6">
        <Section title="Overview">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Status</p>
              <div className="mt-1">
                <StatusSelect engagementId={engagement.id} currentStatus={engagement.status} options={STATUS_OPTIONS} />
              </div>
            </div>
            <Field label="Priority" value={engagement.priority} />
            <Field label="Assigned to" value={assignedStaff?.display_name ?? "Unassigned"} />
            <Field label="Open date" value={engagement.open_date ? new Date(engagement.open_date).toLocaleDateString() : null} />
            <Field label="Due date" value={engagement.due_date ? new Date(engagement.due_date).toLocaleDateString() : null} />
            <Field
              label="Completed date"
              value={engagement.completed_date ? new Date(engagement.completed_date).toLocaleDateString() : null}
            />
          </div>
        </Section>

        <Section title="Tasks">
          {tasks.length === 0 ? (
            <EmptyState message="No tasks yet -- tasks appear once a workflow is started for this engagement." />
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Documents">
          {!documents || documents.length === 0 ? (
            <EmptyState message="No documents uploaded yet." />
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((d) => (
                <li key={d.id} className="py-2 text-sm text-slate">
                  {d.file_name}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Timeline">
          {!activity || activity.length === 0 ? (
            <EmptyState message="No activity recorded yet." />
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate">{a.description}</span>
                  <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Notes"
          action={<AddEngagementNoteForm engagementId={engagement.id} workspaceId={workspace.id} />}
        >
          {!notes || notes.length === 0 ? (
            <EmptyState message="No notes yet." />
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
                  <p>{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{new Date(n.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-slate">{value ?? "--"}</p>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}
