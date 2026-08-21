import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { BookAppointment } from "@/components/portal/BookAppointment";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  scheduled: "accent",
  confirmed: "success",
  completed: "neutral",
  cancelled: "danger",
  no_show: "danger",
};

export default async function PortalAppointmentsPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, title, description, location, meeting_url, start_at, end_at, status")
    .eq("client_id", identity.clientId)
    .order("start_at", { ascending: true })
    .limit(100);

  // Bookable services aren't readable via the portal session's normal RLS
  // scope (no established precedent for the portal reading `services`), so
  // this uses the service-role client -- the portal session itself is still
  // verified above via getPortalIdentity().
  const serviceClient = createServiceClient();
  const { data: bookableServices } = await serviceClient
    .from("services")
    .select("id, name, description, estimated_duration_minutes")
    .eq("workspace_id", identity.workspaceId)
    .eq("is_bookable", true)
    .eq("status", "published")
    .order("name");

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Your upcoming and past appointments with your firm."
        actions={<BookAppointment services={bookableServices ?? []} />}
      />
      <div className="flex-1 px-8 py-6">
        {(appointments ?? []).length === 0 ? (
          <EmptyState message="No appointments scheduled." />
        ) : (
          <ul className="space-y-2">
            {(appointments ?? []).map((a) => (
              <li key={a.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
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
                  <Badge tone={STATUS_TONE[a.status] ?? "neutral"} className="capitalize">
                    {a.status.replace("_", "-")}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
