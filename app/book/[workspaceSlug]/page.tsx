import { createServiceClient } from "@/lib/supabase/service";
import { getBookingSettings } from "@/lib/bookingSettings";
import { PublicBookingFlow } from "@/components/booking/PublicBookingFlow";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { service?: string; staff?: string };
}) {
  const supabase = createServiceClient();

  const { data: workspace } = await supabase.from("workspaces").select("id, name").eq("slug", params.workspaceSlug).maybeSingle();
  if (!workspace) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This booking page isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">Double-check the link, or ask the firm for a new one.</p>
      </div>
    );
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, name, description, estimated_duration_minutes, booking_location_type")
    .eq("workspace_id", workspace.id)
    .eq("is_bookable", true)
    .eq("is_portal_visible", true)
    .order("display_order");

  let staffName: string | null = null;
  if (searchParams.staff) {
    const { data: membership } = await supabase
      .from("workspace_users")
      .select("user_id")
      .eq("workspace_id", workspace.id)
      .eq("user_id", searchParams.staff)
      .eq("status", "active")
      .maybeSingle();
    if (membership) {
      const { data: profile } = await supabase.from("user_profiles").select("display_name").eq("id", searchParams.staff).maybeSingle();
      staffName = profile?.display_name ?? "our team";
    }
  }

  const { windowDays } = await getBookingSettings(supabase, workspace.id);

  return (
    <PublicBookingFlow
      workspaceSlug={params.workspaceSlug}
      workspaceName={workspace.name}
      services={services ?? []}
      preselectedServiceId={searchParams.service ?? null}
      staffId={staffName ? (searchParams.staff ?? null) : null}
      staffName={staffName}
      windowDays={windowDays}
    />
  );
}
