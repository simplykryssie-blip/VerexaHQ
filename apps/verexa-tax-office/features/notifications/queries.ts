import { createClient } from "@/lib/supabase/server";

export async function getNotifications(workspaceId: string, opts?: { unreadOnly?: boolean }) {
  const supabase = await createClient();
  let query = supabase.from("notifications").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(200);
  if (opts?.unreadOnly) query = query.eq("is_read", false);
  const { data } = await query;
  return data ?? [];
}

export async function getUnreadNotificationCount(workspaceId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("is_read", false);
  return count ?? 0;
}

export async function getReminders(workspaceId: string, opts?: { status?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("reminders")
    .select("*, client:clients(id, first_name, last_name, company)")
    .eq("workspace_id", workspaceId)
    .order("scheduled_for", { ascending: false })
    .limit(200);
  if (opts?.status) query = query.eq("status", opts.status as never);
  const { data } = await query;
  return data ?? [];
}

export async function getCommunicationOutbox(workspaceId: string, opts?: { status?: string; channel?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("communication_outbox")
    .select("*, client:clients(id, first_name, last_name, company)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (opts?.status) query = query.eq("status", opts.status as never);
  if (opts?.channel) query = query.eq("channel", opts.channel as never);
  const { data } = await query;
  return data ?? [];
}

export async function getCommunicationEvents(outboxId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("communication_events").select("*").eq("outbox_id", outboxId).order("event_at", { ascending: true });
  return data ?? [];
}
