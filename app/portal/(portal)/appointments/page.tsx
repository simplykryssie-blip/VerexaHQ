import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  scheduled: "text-accent",
  confirmed: "text-green-700",
  completed: "text-muted",
  cancelled: "text-danger",
  no_show: "text-danger",
};

export default async function PortalAppointmentsPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, title, description, location, meeting_url, start_at, end_at, status")
    .order("start_at", { ascending: true })
    .limit(100);

  return (
    <>
      <PageHeader title="Appointments" description="Your upcoming and past appointments with your firm." />
      <div className="flex-1 px-8 py-6">
        {(appointments ?? []).length === 0 ? (
          <EmptyState message="No appointments scheduled." />
        ) : (
          <ul className="space-y-2">
            {(appointments ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{a.title}</p>
                    <p className="text-xs text-muted">
                      {new Date(a.start_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} --{" "}
                      {new Date(a.end_at).toLocaleTimeString([], { timeStyle: "short" })}
                      {a.location && ` -- ${a.location}`}
                    </p>
                    {a.description && <p className="mt-1 text-xs text-slate">{a.description}</p>}
                    {a.meeting_url && (
                      <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs font-medium text-accent hover:underline">
                        Join meeting link
                      </a>
                    )}
                  </div>
                  <span className={`text-xs font-medium capitalize ${STATUS_STYLE[a.status] ?? "text-muted"}`}>{a.status.replace("_", "-")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
