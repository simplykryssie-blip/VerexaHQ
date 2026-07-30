import { createClient } from "@/lib/supabase/server";

export async function getAppointments(workspaceId: string, opts: { from: string; to: string; assignedUserId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(
      "*, client:clients(id, first_name, last_name, company), lead:leads(id, first_name, last_name), appointment_type:appointment_types(id, name, color, location_type), zoom_meeting:zoom_meetings(id, join_url, status)",
    )
    .eq("workspace_id", workspaceId)
    .gte("starts_at", opts.from)
    .lte("starts_at", opts.to)
    .order("starts_at", { ascending: true });
  if (opts.assignedUserId) query = query.eq("assigned_user_id", opts.assignedUserId);
  const { data } = await query;
  return data ?? [];
}

export async function getAppointmentTypes(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("appointment_types").select("*").eq("workspace_id", workspaceId).eq("is_active", true).order("name");
  return data ?? [];
}

export async function getStaffAvailability(workspaceId: string) {
  const supabase = await createClient();
  const [{ data: rules }, { data: blackouts }] = await Promise.all([
    supabase.from("staff_availability_rules").select("*").eq("workspace_id", workspaceId).eq("is_active", true).order("weekday"),
    supabase.from("staff_blackout_periods").select("*").eq("workspace_id", workspaceId).gte("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  return { rules: rules ?? [], blackouts: blackouts ?? [] };
}
