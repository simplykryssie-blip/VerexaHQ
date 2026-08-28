import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PortalTaskItem } from "@/components/portal/PortalTaskItem";

export const dynamic = "force-dynamic";

export default async function PortalTasksPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  // RLS (tasks_select_portal) already scopes this to only tasks marked
  // visibility='client' that belong to this portal user's client or one of
  // their engagements -- same "trust RLS, no extra client_id filter" pattern
  // the signature_requests query on the Documents portal page already uses,
  // since a task can be attached to an engagement with tasks.client_id null.
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, description, due_date, status")
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });

  const open = (tasks ?? []).filter((t) => t.status !== "completed");
  const completed = (tasks ?? []).filter((t) => t.status === "completed");

  return (
    <>
      <PageHeader title="Tasks" description="Things your firm needs from you." />
      <div className="flex-1 space-y-6 px-8 py-6">
        {(tasks ?? []).length === 0 ? (
          <EmptyState message="No tasks right now." />
        ) : (
          <div className="space-y-6">
            {open.length > 0 && (
              <ul className="space-y-2">
                {open.map((t) => (
                  <PortalTaskItem key={t.id} task={t} />
                ))}
              </ul>
            )}
            {completed.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Completed</p>
                <ul className="space-y-2">
                  {completed.map((t) => (
                    <PortalTaskItem key={t.id} task={t} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
