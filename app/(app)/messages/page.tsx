"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PortalConversation, PortalMessage, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";

type ConversationRow = PortalConversation & { clientName: string };

export default function StaffMessagesPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [asInternalNote, setAsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "waiting_on_firm">("all");

  async function loadConversations() {
    setLoading(true);
    const { data, error } = await supabase
      .from("portal_conversations")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const list = (data as PortalConversation[]) ?? [];
    const clientIds = Array.from(new Set(list.map((c) => c.client_id)));
    let clientsMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .in("id", clientIds);
      (clientsData as Client[] | null)?.forEach((c) => {
        const name =
          c.client_type === "business" && c.business_name
            ? c.business_name
            : `${c.first_name} ${c.last_name}`.trim();
        clientsMap.set(c.id, name);
      });
    }

    const rows = list.map((c) => ({ ...c, clientName: clientsMap.get(c.client_id) ?? "—" }));
    setConversations(rows);
    if (rows.length > 0 && !activeId) setActiveId(rows[0].id);
    setError(null);
    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    const { data } = await supabase
      .from("portal_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMessages((data as PortalMessage[]) ?? []);
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const activeConversation = conversations.find((c) => c.id === activeId);
    if (!activeConversation || !draft.trim()) return;
    setSending(true);
    setError(null);

    const { error } = await supabase.rpc("send_portal_message_as_firm", {
      p_client_id: activeConversation.client_id,
      p_subject: null,
      p_message_body: draft,
      p_service_id: null,
      p_conversation_id: activeConversation.id,
      p_attachment_document_id: null,
      p_is_internal: asInternalNote,
    });

    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDraft("");
    await loadConversations();
    loadMessages(activeConversation.id);
  }

  const visibleConversations = conversations.filter(
    (c) => filter === "all" || c.conversation_status === "Waiting on Firm"
  );
  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div>
      <div className="flex items-end justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Client Portal
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Messages</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
            style={{
              borderColor: filter === "all" ? "#0D1B2A" : "#DDE3EC",
              backgroundColor: filter === "all" ? "#0D1B2A" : "white",
              color: filter === "all" ? "white" : "#0D1B2A",
            }}
          >
            All
          </button>
          <button
            onClick={() => setFilter("waiting_on_firm")}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
            style={{
              borderColor: filter === "waiting_on_firm" ? "#0D1B2A" : "#DDE3EC",
              backgroundColor: filter === "waiting_on_firm" ? "#0D1B2A" : "white",
              color: filter === "waiting_on_firm" ? "white" : "#0D1B2A",
            }}
          >
            Waiting on Firm
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 bg-white border border-line rounded-sm divide-y divide-paperDim max-h-[520px] overflow-y-auto">
          {loading && <div className="px-4 py-4 text-sm text-muted">Loading…</div>}
          {!loading && visibleConversations.length === 0 && (
            <div className="px-4 py-4 text-sm text-muted">No conversations yet.</div>
          )}
          {visibleConversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className="w-full text-left px-4 py-3"
              style={{ backgroundColor: activeId === c.id ? "#F5F7FA" : "white" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink truncate">{c.clientName}</div>
                <StatusPill status={c.conversation_status} />
              </div>
              <div className="text-xs text-muted mt-0.5 truncate">{c.subject}</div>
            </button>
          ))}
        </div>

        <div className="col-span-2 bg-white border border-line rounded-sm flex flex-col min-h-[520px]">
          {!activeConversation && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted">
              Select a conversation.
            </div>
          )}
          {activeConversation && (
            <>
              <div className="border-b border-line px-4 py-3">
                <div className="font-semibold text-ink text-sm">
                  {activeConversation.clientName}
                </div>
                <div className="text-xs text-muted">{activeConversation.subject}</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="max-w-[80%] rounded-sm px-3 py-2 text-sm"
                    style={{
                      marginLeft: m.sender_type !== "Client" ? "auto" : "0",
                      backgroundColor: m.is_internal
                        ? "#FDF4E3"
                        : m.sender_type === "Client"
                        ? "#F5F7FA"
                        : "#0D1B2A",
                      color: m.is_internal ? "#B45309" : m.sender_type === "Client" ? "#0D1B2A" : "white",
                      border: m.is_internal ? "1px dashed #B45309" : "none",
                    }}
                  >
                    {m.is_internal && (
                      <div className="text-[10px] uppercase tracking-wide font-bold mb-1">
                        Internal note
                      </div>
                    )}
                    {m.message_body}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSend} className="border-t border-line p-3">
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={asInternalNote}
                      onChange={(e) => setAsInternalNote(e.target.checked)}
                      className="accent-[#B45309]"
                    />
                    Internal note (client won&apos;t see this)
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={asInternalNote ? "Add an internal note…" : "Reply to client…"}
                    className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="bg-ink text-white px-3 py-2 rounded-sm disabled:opacity-50"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
