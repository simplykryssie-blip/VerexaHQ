import { createClient } from "@/lib/supabase/server";
import { NewEngagementForm } from "@/features/engagements/new-engagement-form";

export default async function NewEngagementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const [{ data: clients }, { data: households }, { data: members }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, company").eq("workspace_id", workspaceId).is("archived_at", null),
    supabase.from("tax_households").select("id, household_name").eq("workspace_id", workspaceId),
    supabase
      .from("workspace_members")
      .select("user_id, role, profile:user_profiles(display_name, first_name, last_name)")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
  ]);

  const clientOptions = (clients ?? []).map((c) => ({
    id: c.id,
    label: c.company || `${c.first_name} ${c.last_name}`.trim(),
  }));
  const householdOptions = (households ?? []).map((h) => ({ id: h.id, label: h.household_name }));
  const staffOptions = (members ?? []).map((m) => {
    const profile = m.profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
    const name = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Team member";
    return { id: m.user_id, label: name, sublabel: m.role };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">New tax engagement</h1>
      <NewEngagementForm workspaceId={workspaceId} clients={clientOptions} households={householdOptions} staff={staffOptions} />
    </div>
  );
}
