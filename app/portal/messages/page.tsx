"use client";

import { useEffect, useState } from "react";
import { Send, Plus } from "lucide-react";
import { supabasePortal } from "@/lib/supabasePortal";
import { usePortal } from "@/components/portal/PortalContext";
import type { PortalConversation, PortalMessage } from "@/lib/types";

export default function PortalMessagesPage() {
  const { access } = usePortal();
  const [conversations, setConversations] = useState<PortalConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubject, setNewSubject] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadConversations() {
    if (!access) return;
    setLoading(true);
    const { data } = await supabasePortal
      .from("portal_conversations")
      .select("*")
      .eq("client_id", access.client_id)
      .order("last_message_at", { ascending: false });
    const list = (data as PortalConversation[]) ?? [];
    setConversations(list);
    if (list.length > 0 && !activeId) setActiveId(list[0].id);
    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    const { data } = await supabasePortal
      .from("portal_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMessages((data as PortalMessage[]) ?? []);
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!access || !draft.trim()) return;
    setSending(true);
    setError(null);

    const { data, error } = await supabasePortal.rpc("send_portal_message_as_client", {
      p_client_id: access.client_id,
      p_subject: showNew ? newSubject || "Client Message" : null,
      p_message_body: draft,
      p_service_id: null,
      p_conversation_id: showNew ? null : activeId,
      p_attachment_document_id: null,
    });

    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDraft("");
    setShowNew(false);
    setNewSubject("");
    await loadConversations();
    if (data) {
      // reload the conversation we just posted into
      const { data: msgData } = await supabasePortal
        .from("portal_messages")
        .select("conversation_id")
        .eq("id", data)
        .maybeSingle();
      if (msgData?.conversation_id) {
        setActiveId(msgData.conversation_id);
        loadMessages(msgData.conversation_id);
      }
    }
  }

  if (!access) return null;

  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div>
      <div className="flex items-end justify-between mb-4 border-b border-line pb-3">
        <h1 className="font-slab text-2xl font-bold text-ink">Messages</h1>
        <button
          onClick={() => {
            setShowNew(true);
            setActiveId(null);
            setMessages([]);
          }}
          className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm"
        >
          <Plus size={15} /> New Message
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 bg-white border border-line rounded-sm divide-y divide-paperDim max-h-[420px] overflow-y-auto">
          {loading && <div className="px-4 py-4 text-sm text-muted">Loading…</div>}
          {!loading && conversations.length === 0 && !showNew && (
            <div className="px-4 py-4 text-sm text-muted">No messages yet.</div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setShowNew(false);
                setActiveId(c.id);
              }}
              className="w-full text-left px-4 py-3"
              style={{ backgroundColor: activeId === c.id && !showNew ? "#F5F7FA" : "white" }}
            >
              <div className="text-sm font-semibold text-ink truncate">{c.subject}</div>
              <div className="text-xs text-muted mt-0.5">{c.conversation_status}</div>
            </button>
          ))}
        </div>

        <div className="col-span-2 bg-white border border-line rounded-sm flex flex-col min-h-[420px]">
          {showNew ? (
            <div className="p-4">
              <input
                placeholder="Subject"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm mb-3"
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!activeConversation && (
                <div className="text-sm text-muted">Select a conversation.</div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="max-w-[80%] rounded-sm px-3 py-2 text-sm"
                  style={{
                    marginLeft: m.sender_type === "Client" ? "auto" : "0",
                    backgroundColor: m.sender_type === "Client" ? "#0D1B2A" : "#F5F7FA",
                    color: m.sender_type === "Client" ? "white" : "#0D1B2A",
                  }}
                >
                  {m.message_body}
                </div>
              ))}
            </div>
          )}

          {(activeConversation || showNew) && (
            <form onSubmit={handleSend} className="border-t border-line p-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="bg-ink text-white px-3 py-2 rounded-sm disabled:opacity-50"
              >
                <Send size={15} />
              </button>
            </form>
          )}

          {error && (
            <div className="text-xs text-brick bg-brick/10 border-t border-brick/30 px-4 py-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
