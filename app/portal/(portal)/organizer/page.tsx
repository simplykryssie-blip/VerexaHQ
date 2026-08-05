import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StartOrganizerForm } from "@/components/portal/StartOrganizerForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  reviewed: "Reviewed",
};

export default async function PortalOrganizerPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const [{ data: responses }, { data: templates }] = await Promise.all([
    supabase
      .from("organizer_responses")
      .select("id, status, submitted_at, organizer_template_id, organizer_templates(name)")
      .eq("client_id", identity.clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("organizer_templates")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${identity.workspaceId}`)
      .eq("status", "published")
      .order("name"),
  ]);

  const startedTemplateIds = new Set((responses ?? []).map((r) => (r as unknown as { organizer_template_id?: string }).organizer_template_id));
  const availableTemplates = (templates ?? []).filter((t) => !startedTemplateIds.has(t.id));

  return (
    <>
      <PageHeader title="Tax Organizer" description="Answer a few questions to help us prepare your return." />
      <div className="flex-1 space-y-6 px-8 py-6">
        {availableTemplates.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-ink">Start a new organizer</h2>
            <div className="mt-2">
              <StartOrganizerForm workspaceId={identity.workspaceId} clientId={identity.clientId} templates={availableTemplates} />
            </div>
          </div>
        )}

        {(responses ?? []).length === 0 ? (
          <EmptyState message="No organizers yet." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(responses ?? []).map((r) => (
              <li key={r.id}>
                <Link href={`/portal/organizer/${r.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surfaceMuted">
                  <span className="font-medium text-slate">{(r.organizer_templates as unknown as { name?: string } | null)?.name ?? "Organizer"}</span>
                  <span className="text-xs capitalize text-muted">{STATUS_LABEL[r.status] ?? r.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
