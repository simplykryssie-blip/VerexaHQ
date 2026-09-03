import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// Public, unauthenticated -- resolves a firm's booking link (by workspace
// slug) to what the page needs to render: the firm's name, its bookable
// services, and (if the link was generated for one specific staff member,
// e.g. "book time with Monica") that person's display name. Uses the
// service-role client since an anonymous visitor has no RLS access of
// their own, same pattern as the existing portal booking routes.
export async function GET(request: Request) {
  const allowed = await checkRateLimit(`public-booking-context:${clientIp(request)}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const workspaceSlug = searchParams.get("workspaceSlug");
  const staffId = searchParams.get("staffId");
  if (!workspaceSlug) return NextResponse.json({ error: "workspaceSlug is required." }, { status: 400 });

  const supabase = createServiceClient();

  const { data: workspace } = await supabase.from("workspaces").select("id, name").eq("slug", workspaceSlug).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "This booking page isn't available." }, { status: 404 });

  const { data: services } = await supabase
    .from("services")
    .select("id, name, description, estimated_duration_minutes, booking_location_type")
    .eq("workspace_id", workspace.id)
    .eq("is_bookable", true)
    .eq("is_portal_visible", true)
    .order("display_order");

  let staff: { id: string; name: string } | null = null;
  if (staffId) {
    const { data: membership } = await supabase
      .from("workspace_users")
      .select("user_id")
      .eq("workspace_id", workspace.id)
      .eq("user_id", staffId)
      .eq("status", "active")
      .maybeSingle();
    if (membership) {
      const { data: profile } = await supabase.from("user_profiles").select("display_name").eq("id", staffId).maybeSingle();
      staff = { id: staffId, name: profile?.display_name ?? "our team" };
    }
  }

  return NextResponse.json({
    workspaceName: workspace.name,
    services: services ?? [],
    staff,
  });
}
