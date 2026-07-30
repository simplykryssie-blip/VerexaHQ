import { createClient } from "@/lib/supabase/server";

export async function getPortalOrganizers(clientId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("intake_submissions")
    .select("id, status, tax_year, progress_percent, due_date, assigned_at, submitted_at, locked_at, template:templates(id, name, description)")
    .eq("client_id", clientId)
    .order("assigned_at", { ascending: false });
  return data ?? [];
}

export async function getPortalConversations(clientId: string) {
  const supabase = await createClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .eq("client_id", clientId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (!conversations || conversations.length === 0) return [];

  const ids = conversations.map((c) => c.id);
  const { data: unreadRows } = await supabase.from("messages").select("conversation_id").in("conversation_id", ids).neq("sender_type", "client").is("read_at", null);

  const unreadCounts = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    unreadCounts.set(row.conversation_id, (unreadCounts.get(row.conversation_id) ?? 0) + 1);
  }

  return conversations.map((c) => ({ ...c, unreadCount: unreadCounts.get(c.id) ?? 0 }));
}

export async function getPortalAppointments(clientId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, title, description, status, starts_at, ends_at, location_type, location_text, client_notes, appointment_type:appointment_types(name), zoom_meeting:zoom_meetings(join_url)",
    )
    .eq("client_id", clientId)
    .order("starts_at", { ascending: false });
  return data ?? [];
}

export async function getPortalCompletedReturns(clientId: string) {
  const supabase = await createClient();
  const { data: engagements } = await supabase.from("tax_engagements").select("id, engagement_number, title, tax_year").eq("client_id", clientId);
  const ids = (engagements ?? []).map((e) => e.id);
  if (ids.length === 0) return [];

  const { data: controls } = await supabase
    .from("return_release_controls")
    .select("id, engagement_id, released_at, release_notes")
    .in("engagement_id", ids)
    .not("released_at", "is", null)
    .order("released_at", { ascending: false });

  const engagementById = new Map((engagements ?? []).map((e) => [e.id, e]));
  return (controls ?? []).map((c) => ({ ...c, engagement: engagementById.get(c.engagement_id) ?? null }));
}

export async function getPortalNotifications(clientId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200);
  return data ?? [];
}

export async function getPortalUnreadNotificationCount(clientId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("is_read", false);
  return count ?? 0;
}

export async function getPortalUnreadMessageCount(clientId: string) {
  const supabase = await createClient();
  const { data: conversations } = await supabase.from("conversations").select("id").eq("client_id", clientId);
  const ids = (conversations ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .neq("sender_type", "client")
    .is("read_at", null);
  return count ?? 0;
}

export async function getPortalDashboardSummary(clientId: string, workspaceId: string) {
  const supabase = await createClient();
  const [organizers, openRequests, upcomingAppointments, invoices, pendingSignatures, notifications] = await Promise.all([
    supabase
      .from("intake_submissions")
      .select("id, status, progress_percent, due_date, template:templates(name)")
      .eq("client_id", clientId)
      .order("assigned_at", { ascending: false })
      .limit(5),
    supabase
      .from("document_requests")
      .select("id, title, due_date, status")
      .eq("client_id", clientId)
      .in("status", ["sent", "viewed", "partially_complete"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("appointments")
      .select("id, title, starts_at, location_type, status")
      .eq("client_id", clientId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3),
    supabase.from("invoices").select("balance_due, status").eq("client_id", clientId).eq("workspace_id", workspaceId).neq("status", "void"),
    supabase.from("signature_requests").select("id, title, status").eq("client_id", clientId).in("status", ["sent", "partially_signed"]).limit(5),
    supabase
      .from("notifications")
      .select("id, type, title, message, is_read, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const outstandingBalance = (invoices.data ?? []).reduce((sum, inv) => sum + Number(inv.balance_due), 0);

  return {
    organizers: organizers.data ?? [],
    openRequests: openRequests.data ?? [],
    upcomingAppointments: upcomingAppointments.data ?? [],
    outstandingBalance,
    pendingSignatures: pendingSignatures.data ?? [],
    notifications: notifications.data ?? [],
  };
}
