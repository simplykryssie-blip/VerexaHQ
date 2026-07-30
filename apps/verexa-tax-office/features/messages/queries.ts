import { createClient } from "@/lib/supabase/server";

export async function getConversations(workspaceId: string, opts?: { search?: string; clientId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select("*, client:clients(id, first_name, last_name, company)")
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (opts?.clientId) query = query.eq("client_id", opts.clientId);
  if (opts?.search) query = query.ilike("subject", `%${opts.search}%`);

  const { data: conversations } = await query;
  if (!conversations || conversations.length === 0) return [];

  const ids = conversations.map((c) => c.id);
  const { data: unreadRows } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", ids)
    .eq("sender_type", "client")
    .is("read_at", null);

  const unreadCounts = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    unreadCounts.set(row.conversation_id, (unreadCounts.get(row.conversation_id) ?? 0) + 1);
  }

  return conversations.map((c) => ({ ...c, unreadCount: unreadCounts.get(c.id) ?? 0 }));
}

export async function getConversationDetail(conversationId: string) {
  const supabase = await createClient();
  const [{ data: conversation }, { data: messages }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*, client:clients(id, first_name, last_name, company)")
      .eq("id", conversationId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("*, attachment:documents(id, display_name, bucket_id, storage_path)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);
  return { conversation, messages: messages ?? [] };
}

export async function getTotalUnreadCount(workspaceId: string) {
  const supabase = await createClient();
  const { data: conversations } = await supabase.from("conversations").select("id").eq("workspace_id", workspaceId);
  const ids = (conversations ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .eq("sender_type", "client")
    .is("read_at", null);
  return count ?? 0;
}
